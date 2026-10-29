import type { Ref } from 'vue'
import type { AuthResult, AuthTokens, ShopperLocation, User } from '~/types'
import * as authApi from '~/services/authService'
import { isUnauthorized, ApiError } from '~/services/apiError'

export type AuthStatus = 'unknown' | 'anonymous' | 'authenticated'

/** Refresh this long before the access token expires. */
const REFRESH_SKEW_MS = 60 * 1000

// Client-only session internals (tokens never go into serialisable state).
let tokens: AuthTokens | null = null
let refreshTimer: ReturnType<typeof setTimeout> | null = null
let inflight: Promise<boolean> | null = null
let channel: BroadcastChannel | null = null
let state: { user: Ref<User | null>; status: Ref<AuthStatus> } | null = null
let onExpired: (() => void) | null = null

function bind() {
  if (!state) {
    state = {
      user: useState<User | null>('auth-user', () => null),
      status: useState<AuthStatus>('auth-status', () => 'unknown'),
    }
  }
  return state
}

function broadcast(type: 'login' | 'logout' | 'refresh') {
  try {
    channel?.postMessage({ type })
  } catch {
    /* ignore */
  }
}

function schedule() {
  if (refreshTimer) clearTimeout(refreshTimer)
  refreshTimer = null
  if (!tokens) return
  const delay = Math.max(5000, tokens.accessExpiresAt - Date.now() - REFRESH_SKEW_MS)
  refreshTimer = setTimeout(() => void refreshTokens(), delay)
}

function applySession(result: AuthResult, event: 'login' | 'refresh' | null) {
  const s = bind()
  tokens = result.tokens
  writeAuthCookie(result.tokens)
  s.user.value = result.user
  s.status.value = 'authenticated'
  schedule()
  if (event) broadcast(event)
}

function clearSession(reason: 'logout' | 'expired' | 'remote') {
  const s = bind()
  const wasSignedIn = s.status.value === 'authenticated'
  tokens = null
  if (refreshTimer) clearTimeout(refreshTimer)
  refreshTimer = null
  clearAuthCookie()
  s.user.value = null
  s.status.value = 'anonymous'
  if (reason === 'logout') broadcast('logout')
  if (reason === 'expired' && wasSignedIn) onExpired?.()
}

async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  // Serialise refreshes across tabs so a rotated token is never reused.
  const locks = (navigator as Navigator & { locks?: { request: (n: string, cb: () => Promise<T>) => Promise<T> } }).locks
  return locks ? locks.request('helamart-auth-refresh', fn) : fn()
}

/** Exchange the refresh token for a new pair. Single-flight; returns false if the session ended. */
function refreshTokens(): Promise<boolean> {
  if (inflight) return inflight
  inflight = withLock(async () => {
    // Another tab may already have rotated the tokens — adopt them instead of reusing ours.
    const shared = readAuthCookie()
    if (shared && tokens && shared.refreshToken !== tokens.refreshToken && shared.accessExpiresAt - Date.now() > REFRESH_SKEW_MS) {
      tokens = shared
      schedule()
      return true
    }
    const current = shared ?? tokens
    if (!current || current.refreshExpiresAt <= Date.now()) {
      clearSession('expired')
      return false
    }
    try {
      applySession(await authApi.refresh(current.refreshToken), 'refresh')
      return true
    } catch (e) {
      if (isUnauthorized(e)) clearSession('expired')
      // Network-type failures keep the session; the next call will retry.
      return !isUnauthorized(e) && !!tokens
    }
  }).finally(() => {
    inflight = null
  })
  return inflight
}

/** Re-establish the session from the cookie on page load / tab sync. */
async function restore() {
  const s = bind()
  const saved = readAuthCookie()
  if (!saved || saved.refreshExpiresAt <= Date.now()) {
    if (saved) clearAuthCookie()
    tokens = null
    s.user.value = null
    s.status.value = 'anonymous'
    return
  }
  tokens = saved
  try {
    if (saved.accessExpiresAt - Date.now() > REFRESH_SKEW_MS) {
      s.user.value = await authApi.me(saved.accessToken)
      s.status.value = 'authenticated'
      schedule()
    } else if (!(await refreshTokens())) {
      s.status.value = 'anonymous'
    }
  } catch (e) {
    if (isUnauthorized(e) && (await refreshTokens())) return
    clearSession('remote')
  }
}

/** Wire up cross-tab sync and tab-visibility checks. Called once from the auth plugin. */
export function initAuth(expiredHandler: () => void) {
  bind()
  onExpired = expiredHandler
  if ('BroadcastChannel' in window) {
    channel = new BroadcastChannel('helamart-auth')
    channel.onmessage = (e: MessageEvent<{ type: string }>) => {
      if (e.data.type === 'logout') clearSession('remote')
      else void restore()
    }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !tokens) return
    // Timers are throttled in background tabs — catch up when the user returns.
    if (tokens.refreshExpiresAt <= Date.now()) clearSession('expired')
    else if (tokens.accessExpiresAt - Date.now() < REFRESH_SKEW_MS) void refreshTokens()
  })
  return restore()
}

export function useAuth() {
  const { user, status } = bind()
  const isAuthenticated = computed(() => status.value === 'authenticated')

  async function login(email: string, password: string, remember: boolean) {
    applySession(await authApi.login(email, password, remember), 'login')
  }

  async function register(input: authApi.RegisterInput, remember: boolean) {
    applySession(await authApi.register(input, remember), 'login')
  }

  async function loginWithGoogle(input: Parameters<typeof authApi.loginWithGoogle>[0], remember: boolean) {
    applySession(await authApi.loginWithGoogle(input, remember), 'login')
  }

  async function logout() {
    const rt = tokens?.refreshToken ?? null
    clearSession('logout')
    try {
      await authApi.logout(rt)
    } catch {
      /* the local session is already gone */
    }
  }

  /** A valid access token, refreshed first if it's about to expire. */
  async function getAccessToken(): Promise<string | null> {
    if (!tokens) return null
    if (tokens.accessExpiresAt - Date.now() < REFRESH_SKEW_MS && !(await refreshTokens())) return null
    return tokens?.accessToken ?? null
  }

  /** Call an authenticated API; on 401 refresh once and retry (standard bearer-token flow). */
  async function authorized<T>(call: (accessToken: string) => Promise<T>): Promise<T> {
    const token = await getAccessToken()
    if (!token) throw new ApiError(401, 'Please log in to continue.', 'NO_SESSION')
    try {
      return await call(token)
    } catch (e) {
      if (!isUnauthorized(e) || !(await refreshTokens()) || !tokens) throw e
      return call(tokens.accessToken)
    }
  }

  /** Save the shopping area on the account (everywhere the shopper signs in). */
  async function savePreferredLocation(location: ShopperLocation) {
    const updated = await authorized((t) => authApi.savePreferredLocation(t, location))
    if (user.value?.id === updated.id) user.value = updated
    return updated
  }

    /** Expiry info for the account menu. */
  function sessionInfo() {
    return tokens ? { accessExpiresAt: tokens.accessExpiresAt, refreshExpiresAt: tokens.refreshExpiresAt, remember: tokens.remember } : null
  }

  return { user, status, isAuthenticated, login, register, loginWithGoogle, logout, getAccessToken, authorized, sessionInfo, savePreferredLocation }
}
