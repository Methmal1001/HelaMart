import type { Ref } from 'vue'
import type { AdminTokens, Permission, StaffView } from '~/types/admin'
import * as adminAuth from '~/services/admin/auth'
import { ApiError, isUnauthorized } from '~/services/apiError'
import { base64UrlDecode, base64UrlEncode } from '~/utils/jwt'

/**
 * Back-office session (completely separate from the customer session).
 *  - Cookie scoped to /admin, SameSite=Strict, Secure on HTTPS, browser-session only.
 *  - 10-minute access tokens, rotated refresh tokens, absolute session limit.
 *  - Inactivity sign-out with a one-minute warning; heartbeat while the user is active.
 *  - Cross-tab sign-out; step-up (password re-entry) for sensitive actions.
 */

type Status = 'unknown' | 'anonymous' | 'authenticated'
const COOKIE = 'helamart_admin'
const SKEW = 60 * 1000

let tokens: AdminTokens | null = null
let state: {
  user: Ref<StaffView | null>
  status: Ref<Status>
  idleWarning: Ref<number | null>
  stepUp: Ref<{ reason: string } | null>
  signedOutReason: Ref<string>
} | null = null
let restorePromise: Promise<void> | null = null
let refreshing: Promise<boolean> | null = null
let refreshTimer: ReturnType<typeof setTimeout> | null = null
let idleTimer: ReturnType<typeof setInterval> | null = null
let channel: BroadcastChannel | null = null
let lastActivity = Date.now()
let lastHeartbeat = Date.now()
let idleMinutes = 15
let stepUpResolver: ((ok: boolean) => void) | null = null

function bind() {
  if (!state) {
    state = {
      user: useState<StaffView | null>('admin-user', () => null),
      status: useState<Status>('admin-status', () => 'unknown'),
      idleWarning: useState<number | null>('admin-idle-warning', () => null),
      stepUp: useState<{ reason: string } | null>('admin-step-up', () => null),
      signedOutReason: useState<string>('admin-signed-out', () => ''),
    }
  }
  return state
}

// ------------------------------------------------------------------ cookie

function readCookie(): AdminTokens | null {
  const raw = document.cookie.split('; ').find((c) => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1)
  if (!raw) return null
  try {
    return JSON.parse(base64UrlDecode(raw)) as AdminTokens
  } catch {
    return null
  }
}

function writeCookie(t: AdminTokens) {
  const secure = location.protocol === 'https:' ? '; Secure' : ''
  // No Max-Age: an admin session never survives closing the browser.
  document.cookie = `${COOKIE}=${base64UrlEncode(JSON.stringify(t))}; Path=/admin; SameSite=Strict${secure}`
}

function clearCookie() {
  document.cookie = `${COOKIE}=; Path=/admin; SameSite=Strict; Max-Age=0`
}

// ------------------------------------------------------------------ session lifecycle

function apply(result: adminAuth.AdminLoginResult, broadcast = true) {
  const s = bind()
  tokens = result.tokens
  writeCookie(result.tokens)
  s.user.value = result.user
  s.status.value = 'authenticated'
  s.signedOutReason.value = ''
  lastActivity = Date.now()
  scheduleRefresh()
  startIdleWatch()
  if (broadcast) channel?.postMessage({ type: 'login' })
}

function end(reason = '', broadcast = true) {
  const s = bind()
  tokens = null
  clearCookie()
  if (refreshTimer) clearTimeout(refreshTimer)
  if (idleTimer) clearInterval(idleTimer)
  refreshTimer = idleTimer = null
  s.user.value = null
  s.status.value = 'anonymous'
  s.idleWarning.value = null
  s.signedOutReason.value = reason
  stepUpResolver?.(false)
  stepUpResolver = null
  s.stepUp.value = null
  if (broadcast) channel?.postMessage({ type: 'logout', reason })
  if (location.pathname.startsWith('/admin') && location.pathname !== '/admin/login') {
    void navigateTo({ path: '/admin/login', query: { redirect: location.pathname } })
  }
}

function scheduleRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer)
  if (!tokens) return
  refreshTimer = setTimeout(() => void refreshTokens(), Math.max(5000, tokens.accessExpiresAt - Date.now() - SKEW))
}

function refreshTokens(): Promise<boolean> {
  if (refreshing) return refreshing
  refreshing = (async () => {
    const shared = readCookie()
    // Another tab already rotated — adopt instead of reusing the old token.
    if (shared && tokens && shared.refreshToken !== tokens.refreshToken && shared.accessExpiresAt - Date.now() > SKEW) {
      tokens = shared
      scheduleRefresh()
      return true
    }
    const current = shared ?? tokens
    if (!current) return false
    try {
      apply(await adminAuth.refresh(current.refreshToken), false)
      return true
    } catch (e) {
      end(e instanceof ApiError ? e.message : 'Your session ended.')
      return false
    }
  })().finally(() => (refreshing = null))
  return refreshing
}

// ------------------------------------------------------------------ inactivity

function onActivity() {
  lastActivity = Date.now()
  const s = bind()
  if (s.idleWarning.value !== null) s.idleWarning.value = null
  // Heartbeat so the server knows the admin is still active (at most once a minute).
  if (tokens && Date.now() - lastHeartbeat > 60000) {
    lastHeartbeat = Date.now()
    void getToken().then((t) => {
      if (t) void adminAuth.touch(t).catch(() => undefined)
    })
  }
}

function startIdleWatch() {
  if (idleTimer) clearInterval(idleTimer)
  idleMinutes = adminAuth.sessionPolicy().idleMinutes
  idleTimer = setInterval(() => {
    const s = bind()
    if (s.status.value !== 'authenticated') return
    const idleFor = Date.now() - lastActivity
    const limit = idleMinutes * 60e3
    if (idleFor >= limit) {
      void logout('You were signed out after ' + idleMinutes + ' minutes of inactivity.')
    } else if (idleFor >= limit - 60e3) {
      s.idleWarning.value = Math.ceil((limit - idleFor) / 1000)
    }
  }, 1000)
}

async function getToken(): Promise<string | null> {
  if (!tokens) return null
  if (tokens.accessExpiresAt - Date.now() < SKEW && !(await refreshTokens())) return null
  return tokens?.accessToken ?? null
}

async function logout(reason = '') {
  const t = tokens
  end(reason)
  if (t) await adminAuth.logout(t.accessToken, t.refreshToken).catch(() => undefined)
}

/** Restore the session from the cookie once per page load. */
function restore(): Promise<void> {
  if (restorePromise) return restorePromise
  restorePromise = (async () => {
    const s = bind()
    if (!channel && 'BroadcastChannel' in window) {
      channel = new BroadcastChannel('helamart-admin-auth')
      channel.onmessage = (e: MessageEvent<{ type: string; reason?: string }>) => {
        if (e.data.type === 'logout') end(e.data.reason || 'You signed out in another tab.', false)
        else {
          restorePromise = null
          void restore()
        }
      }
      for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart', 'pointermove']) window.addEventListener(ev, onActivity, { passive: true })
    }
    const saved = readCookie()
    if (!saved || saved.refreshExpiresAt <= Date.now()) {
      if (saved) clearCookie()
      s.status.value = 'anonymous'
      return
    }
    tokens = saved
    try {
      if (saved.accessExpiresAt - Date.now() > SKEW) {
        s.user.value = await adminAuth.me(saved.accessToken)
        s.status.value = 'authenticated'
        scheduleRefresh()
        startIdleWatch()
      } else if (!(await refreshTokens())) {
        s.status.value = 'anonymous'
      }
    } catch (e) {
      if (isUnauthorized(e) && (await refreshTokens())) return
      end(e instanceof ApiError ? e.message : '', false)
    }
  })()
  return restorePromise
}

export function useAdminAuth() {
  const { user, status, idleWarning, stepUp, signedOutReason } = bind()
  const permissions = computed(() => new Set<Permission>(user.value?.effectivePermissions ?? []))
  const isAuthenticated = computed(() => status.value === 'authenticated')

  function can(...perms: Permission[]) {
    return perms.every((p) => permissions.value.has(p))
  }

  /** Ask for the password again (sensitive actions). Resolves true once confirmed. */
  function requestStepUp(reason: string): Promise<boolean> {
    stepUpResolver?.(false)
    stepUp.value = { reason }
    return new Promise((r) => (stepUpResolver = r))
  }

  async function confirmStepUp(password: string) {
    const t = await getToken()
    if (!t) throw new ApiError(401, 'Please sign in again.')
    await adminAuth.reauthenticate(t, password)
    stepUp.value = null
    stepUpResolver?.(true)
    stepUpResolver = null
  }

  function cancelStepUp() {
    stepUp.value = null
    stepUpResolver?.(false)
    stepUpResolver = null
  }

  /**
   * Call an admin API with the current token. Handles token refresh, forced
   * sign-out on 401, and password step-up on STEP_UP_REQUIRED (then retries).
   */
  async function call<T>(fn: (token: string) => Promise<T>, stepUpReason = 'Confirm your password to continue.'): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const t = await getToken()
      if (!t) {
        end('Please sign in again.')
        throw new ApiError(401, 'Please sign in again.')
      }
      try {
        return await fn(t)
      } catch (e) {
        if (e instanceof ApiError && e.code === 'STEP_UP_REQUIRED') {
          if (!(await requestStepUp(stepUpReason))) throw new ApiError(403, 'Action cancelled.', 'CANCELLED')
          continue
        }
        if (isUnauthorized(e)) {
          if ((e as ApiError).code === 'TOKEN_EXPIRED' && (await refreshTokens())) continue
          end((e as ApiError).message)
        }
        throw e
      }
    }
    throw new ApiError(500, 'Request failed.')
  }

  async function refreshMe() {
    const t = await getToken()
    if (t) user.value = await adminAuth.me(t)
  }

  return {
    user,
    status,
    isAuthenticated,
    permissions,
    idleWarning,
    stepUp,
    signedOutReason,
    can,
    call,
    restore,
    logout,
    refreshMe,
    requestStepUp,
    confirmStepUp,
    cancelStepUp,
    stayActive: onActivity,
    /** Login steps (used by the sign-in page). */
    login: adminAuth.login,
    verifyMfa: async (challengeId: string, code: string) => {
      const r = await adminAuth.verifyMfa(challengeId, code, navigator.userAgent)
      if ('tokens' in r) apply(r)
      return r
    },
    completePasswordChange: async (challengeId: string, pw: string) => apply(await adminAuth.completePasswordChange(challengeId, pw, navigator.userAgent)),
  }
}
