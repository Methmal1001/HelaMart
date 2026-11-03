import type { Ref } from 'vue'
import type { AdminTokens, Permission, StaffView } from '~/types/admin'
import * as adminAuth from '~/services/admin/auth'
import * as apiAuth from '~/services/admin/apiAuth'
import { ApiError, isUnauthorized } from '~/services/apiError'
import { backendEnabled } from '~/services/http'
import { base64UrlDecode, base64UrlEncode } from '~/utils/jwt'

/**
 * Back-office session (completely separate from the customer session).
 *  - Cookie scoped to /admin, SameSite=Strict, Secure on HTTPS, browser-session only.
 *  - 10-minute access tokens, rotated refresh tokens, absolute session limit.
 *  - Inactivity sign-out with a one-minute warning; heartbeat while the user is active.
 *  - Cross-tab sign-out; step-up (password re-entry) for sensitive actions.
 *
 * With the HelaMart API (the default), staff sign in through `/api/admin/auth` and
 * the ordering pages (order desk, orders, order workflow) call the API with that
 * session (`callApi`). The admin pages that still run on in-browser data use a
 * matching in-browser session for the same person (`call`), opened automatically.
 */

type Status = 'unknown' | 'anonymous' | 'authenticated'
const SKEW = 60 * 1000

/** One token pair kept in a /admin-scoped, browser-session cookie, refreshed single-flight. */
class TokenStore {
  tokens: AdminTokens | null = null
  private refreshing: Promise<boolean> | null = null
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private cookie: string,
    private doRefresh: (refreshToken: string) => Promise<{ tokens: AdminTokens; user: StaffView }>,
    private onFail: (e: unknown) => void,
  ) {}

  read(): AdminTokens | null {
    const raw = document.cookie.split('; ').find((c) => c.startsWith(`${this.cookie}=`))?.slice(this.cookie.length + 1)
    if (!raw) return null
    try {
      return JSON.parse(base64UrlDecode(raw)) as AdminTokens
    } catch {
      return null
    }
  }

  set(t: AdminTokens) {
    this.tokens = t
    const secure = location.protocol === 'https:' ? '; Secure' : ''
    // No Max-Age: an admin session never survives closing the browser.
    document.cookie = `${this.cookie}=${base64UrlEncode(JSON.stringify(t))}; Path=/admin; SameSite=Strict${secure}`
    this.schedule()
  }

  clear() {
    this.tokens = null
    document.cookie = `${this.cookie}=; Path=/admin; SameSite=Strict; Max-Age=0`
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  schedule() {
    if (this.timer) clearTimeout(this.timer)
    if (!this.tokens) return
    this.timer = setTimeout(() => void this.refresh(), Math.max(5000, this.tokens.accessExpiresAt - Date.now() - SKEW))
  }

  refresh(): Promise<boolean> {
    if (this.refreshing) return this.refreshing
    this.refreshing = (async () => {
      const shared = this.read()
      // Another tab already rotated — adopt instead of reusing the old token.
      if (shared && this.tokens && shared.refreshToken !== this.tokens.refreshToken && shared.accessExpiresAt - Date.now() > SKEW) {
        this.tokens = shared
        this.schedule()
        return true
      }
      const current = shared ?? this.tokens
      if (!current) return false
      try {
        this.set((await this.doRefresh(current.refreshToken)).tokens)
        return true
      } catch (e) {
        this.onFail(e)
        return false
      }
    })().finally(() => (this.refreshing = null))
    return this.refreshing
  }

  async token(): Promise<string | null> {
    if (!this.tokens) return null
    if (this.tokens.accessExpiresAt - Date.now() < SKEW && !(await this.refresh())) return null
    return this.tokens?.accessToken ?? null
  }
}

let state: {
  user: Ref<StaffView | null>
  status: Ref<Status>
  idleWarning: Ref<number | null>
  stepUp: Ref<{ reason: string } | null>
  signedOutReason: Ref<string>
} | null = null
let restorePromise: Promise<void> | null = null
let idleTimer: ReturnType<typeof setInterval> | null = null
let channel: BroadcastChannel | null = null
let lastActivity = Date.now()
let lastHeartbeat = Date.now()
let idleMinutes = 15
let stepUpResolver: ((ok: boolean) => void) | null = null

/** The in-browser session (admin pages not yet on the API). Re-opened from the API session when it lapses. */
const local = new TokenStore('helamart_admin', (rt) => adminAuth.refresh(rt), () => {
  if (backendEnabled()) local.clear()
  else end('Your session ended.')
})
/** The HelaMart API session. */
const remote = new TokenStore('helamart_admin_api', (rt) => apiAuth.refresh(rt), (e) => end(e instanceof ApiError ? e.message : 'Your session ended.'))

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

// ------------------------------------------------------------------ session lifecycle

function signedIn(user: StaffView, broadcast: boolean) {
  const s = bind()
  s.user.value = user
  s.status.value = 'authenticated'
  s.signedOutReason.value = ''
  lastActivity = Date.now()
  startIdleWatch()
  if (broadcast) channel?.postMessage({ type: 'login' })
}

/** Open the matching in-browser session for the API-signed-in person (for pages not yet on the API). */
function bridgeLocal(email: string) {
  const r = adminAuth.bridgeSession(email, navigator.userAgent)
  if (r) local.set(r.tokens)
}

async function applyApi(result: adminAuth.AdminLoginResult, broadcast = true) {
  remote.set(result.tokens)
  bridgeLocal(result.user.email)
  signedIn(result.user, broadcast)
  try {
    idleMinutes = (await apiAuth.policy()).idleMinutes
  } catch {
    /* keep the default */
  }
}

function applyLocal(result: adminAuth.AdminLoginResult, broadcast = true) {
  local.set(result.tokens)
  idleMinutes = adminAuth.sessionPolicy().idleMinutes
  signedIn(result.user, broadcast)
}

function end(reason = '', broadcast = true) {
  const s = bind()
  remote.clear()
  local.clear()
  if (idleTimer) clearInterval(idleTimer)
  idleTimer = null
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

/** Token for the in-browser admin services (re-opened from the API session if needed). */
async function localToken(): Promise<string | null> {
  const t = await local.token()
  if (t || !backendEnabled()) return t
  const email = bind().user.value?.email
  if (!email || !remote.tokens) return null
  bridgeLocal(email)
  return local.tokens?.accessToken ?? null
}

// ------------------------------------------------------------------ inactivity

function onActivity() {
  lastActivity = Date.now()
  const s = bind()
  if (s.idleWarning.value !== null) s.idleWarning.value = null
  // Heartbeat so the server knows the admin is still active (at most once a minute).
  if (Date.now() - lastHeartbeat > 60000 && (remote.tokens || local.tokens)) {
    lastHeartbeat = Date.now()
    if (backendEnabled()) void remote.token().then((t) => void (t && apiAuth.touch(t).catch(() => undefined)))
    void local.token().then((t) => void (t && adminAuth.touch(t).catch(() => undefined)))
  }
}

function startIdleWatch() {
  if (idleTimer) clearInterval(idleTimer)
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

async function logout(reason = '') {
  const r = remote.tokens
  const l = local.tokens
  end(reason)
  if (r) await apiAuth.logout(r.accessToken, r.refreshToken).catch(() => undefined)
  if (l) await adminAuth.logout(l.accessToken, l.refreshToken).catch(() => undefined)
}

/** Restore the session from the cookies once per page load. */
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
    const store = backendEnabled() ? remote : local
    const saved = store.read()
    if (!saved || saved.refreshExpiresAt <= Date.now()) {
      if (saved) store.clear()
      s.status.value = 'anonymous'
      return
    }
    store.tokens = saved
    if (backendEnabled()) {
      const l = local.read()
      if (l && l.refreshExpiresAt > Date.now()) local.tokens = l
    }
    try {
      if (saved.accessExpiresAt - Date.now() <= SKEW && !(await store.refresh())) {
        s.status.value = 'anonymous'
        return
      }
      store.schedule()
      const user = backendEnabled() ? await apiAuth.me(store.tokens!.accessToken) : await adminAuth.me(store.tokens!.accessToken)
      if (backendEnabled()) {
        if (!local.tokens) bridgeLocal(user.email)
        else local.schedule()
        idleMinutes = await apiAuth.policy().then((p) => p.idleMinutes).catch(() => idleMinutes)
      } else idleMinutes = adminAuth.sessionPolicy().idleMinutes
      signedIn(user, false)
    } catch (e) {
      if (isUnauthorized(e) && (await store.refresh())) {
        restorePromise = null
        return restore()
      }
      end(e instanceof ApiError ? e.message : '', false)
    }
  })()
  return restorePromise
}

export function useAdminAuth() {
  const { user, status, idleWarning, stepUp, signedOutReason } = bind()
  const permissions = computed(() => new Set<Permission>(user.value?.effectivePermissions ?? []))
  const isAuthenticated = computed(() => status.value === 'authenticated')
  /** HelaMart head office (vs. a supermarket's staff). */
  const isPlatform = computed(() => !!user.value && user.value.tenantId === null)
  /** Supermarket staff who work across every branch (e.g. the Chain Admin). */
  const isChainLevel = computed(() => !!user.value?.tenantId && user.value.branchIds.length === 0)
  /** Restricted supermarkets are read-only. */
  const readOnly = computed(() => user.value?.tenantStatus === 'restricted')

  function can(...perms: Permission[]) {
    return perms.every((p) => permissions.value.has(p))
  }

  /** Ask for the password again (sensitive actions). Resolves true once confirmed. */
  function requestStepUp(reason: string): Promise<boolean> {
    stepUpResolver?.(false)
    stepUp.value = { reason }
    return new Promise((r) => (stepUpResolver = r))
  }

  /** Confirms the password with the API (and the in-browser session, so both allow the action). */
  async function confirmStepUp(password: string) {
    if (backendEnabled()) {
      const t = await remote.token()
      if (!t) throw new ApiError(401, 'Please sign in again.')
      await apiAuth.reauthenticate(t, password)
      const l = await localToken()
      if (l) await adminAuth.reauthenticate(l, password).catch(() => undefined)
    } else {
      const t = await local.token()
      if (!t) throw new ApiError(401, 'Please sign in again.')
      await adminAuth.reauthenticate(t, password)
    }
    stepUp.value = null
    stepUpResolver?.(true)
    stepUpResolver = null
  }

  function cancelStepUp() {
    stepUp.value = null
    stepUpResolver?.(false)
    stepUpResolver = null
  }

  /** Token refresh, forced sign-out on 401, and password step-up on STEP_UP_REQUIRED (then retry). */
  async function withToken<T>(get: () => Promise<string | null>, store: TokenStore, fn: (token: string) => Promise<T>, stepUpReason: string): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const t = await get()
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
          if ((e as ApiError).code === 'TOKEN_EXPIRED' && (await store.refresh())) continue
          // The in-browser session lapsed while the API session is fine: re-open it.
          if (store === local && backendEnabled() && remote.tokens) {
            local.clear()
            continue
          }
          end((e as ApiError).message)
        }
        throw e
      }
    }
    throw new ApiError(500, 'Request failed.')
  }

  /** Admin pages still on in-browser data. */
  function call<T>(fn: (token: string) => Promise<T>, stepUpReason = 'Confirm your password to continue.'): Promise<T> {
    return withToken(localToken, local, fn, stepUpReason)
  }

  /** The HelaMart API (ordering: order desk, orders, order workflow). Offline demo: same as `call`. */
  function callApi<T>(fn: (token: string) => Promise<T>, stepUpReason = 'Confirm your password to continue.'): Promise<T> {
    if (!backendEnabled()) return call(fn, stepUpReason)
    return withToken(() => remote.token(), remote, fn, stepUpReason)
  }

  async function refreshMe() {
    if (backendEnabled()) {
      const t = await remote.token()
      if (t) user.value = await apiAuth.me(t)
    } else {
      const t = await local.token()
      if (t) user.value = await adminAuth.me(t)
    }
  }

  /** Super Admin is working inside a supermarket's portal. */
  const acting = computed(() => user.value?.acting ?? null)

  /** Super Admin: open a supermarket's portal with full chain-admin access (on the API and the in-browser pages). */
  async function manageTenant(tenantId: string) {
    const { startManagingTenant } = await import('~/services/admin/platformApi')
    const reason = 'Managing a supermarket’s portal needs your password confirmed.'
    if (backendEnabled()) await callApi((t) => apiAuth.startManaging(t, tenantId), reason)
    await call((t) => startManagingTenant(t, tenantId), reason)
    await refreshMe()
    await navigateTo('/admin')
  }

  /** Back to HelaMart control. */
  async function stopManaging() {
    const { stopManagingTenant } = await import('~/services/admin/platformApi')
    if (backendEnabled()) await callApi((t) => apiAuth.stopManaging(t))
    await call(stopManagingTenant)
    await refreshMe()
    await navigateTo('/admin/supermarkets')
  }

  return {
    user,
    acting,
    manageTenant,
    stopManaging,
    status,
    isAuthenticated,
    isPlatform,
    isChainLevel,
    readOnly,
    permissions,
    idleWarning,
    stepUp,
    signedOutReason,
    can,
    call,
    callApi,
    restore,
    logout,
    refreshMe,
    requestStepUp,
    confirmStepUp,
    cancelStepUp,
    stayActive: onActivity,
    /** Login steps (used by the sign-in page). */
    login: (email: string, password: string) => (backendEnabled() ? apiAuth.login(email, password) : adminAuth.login(email, password)),
    verifyMfa: async (challengeId: string, code: string) => {
      if (backendEnabled()) {
        const r = await apiAuth.verifyMfa(challengeId, code)
        if ('tokens' in r) await applyApi(r)
        return r
      }
      const r = await adminAuth.verifyMfa(challengeId, code, navigator.userAgent)
      if ('tokens' in r) applyLocal(r)
      return r
    },
    completePasswordChange: async (challengeId: string, pw: string) => {
      if (backendEnabled()) await applyApi(await apiAuth.completePasswordChange(challengeId, pw))
      else applyLocal(await adminAuth.completePasswordChange(challengeId, pw, navigator.userAgent))
    },
    /** The current 2FA code for testers (development only): from the API, or the in-browser stand-in. */
    demoCode: async (challengeId: string) => (backendEnabled() ? apiAuth.demoCode(challengeId).catch(() => null) : adminAuth.demoAuthenticatorCode(challengeId)),
  }
}
