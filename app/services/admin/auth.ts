import type { AdminSessionInfo, AdminTokens, StaffView } from '~/types/admin'
import { api } from '../http'

/**
 * Admin sign-in API (HelaMart backend):
 *   POST /admin/auth/login → POST /admin/auth/mfa → [POST /admin/auth/password] → session
 *   POST /admin/auth/refresh · /logout · /reauth · /touch · GET /admin/auth/me · /sessions
 * The server checks the password and then a 6-digit authenticator code, rotates refresh tokens
 * (re-using a rotated one revokes the session family) and locks an email after repeated failures.
 */

export interface AdminLoginResult {
  user: StaffView
  tokens: AdminTokens
}

/** Step 1: password. Always continues to two-factor — never issues a session directly. */
export async function login(email: string, password: string): Promise<{ challengeId: string }> {
  const r = await api<{ challengeId: string }>('/admin/auth/login', { method: 'POST', body: { email, password } })
  void loadPolicy()
  return r
}

/** Step 2: 6-digit authenticator code. (The server reads the device from the request's User-Agent.) */
export function verifyMfa(challengeId: string, code: string, _userAgent: string): Promise<AdminLoginResult | { passwordChangeRequired: true; reason: 'new' | 'expired' }> {
  return api('/admin/auth/mfa', { method: 'POST', body: { challengeId, code } })
}

/** Step 3 (when required): choose a new password, then the session is issued. */
export function completePasswordChange(challengeId: string, newPassword: string, _userAgent: string): Promise<AdminLoginResult> {
  return api<AdminLoginResult>('/admin/auth/password', { method: 'POST', body: { challengeId, newPassword } })
}

/** Rotate the refresh token. Reuse of an old token revokes the whole session family. */
export function refresh(refreshToken: string): Promise<AdminLoginResult> {
  return api<AdminLoginResult>('/admin/auth/refresh', { method: 'POST', body: { refreshToken } })
}

/** Heartbeat: records activity so an active admin isn't signed out for "inactivity". */
export async function touch(accessToken: string) {
  await api<void>('/admin/auth/touch', { method: 'POST', token: accessToken })
}

export async function logout(_accessToken: string | null, refreshToken: string | null) {
  if (!refreshToken) return
  await api<void>('/admin/auth/logout', { method: 'POST', body: { refreshToken } })
}

/** Confirm the password again to unlock sensitive actions for a few minutes. */
export function reauthenticate(accessToken: string, password: string): Promise<{ stepUpUntil: number }> {
  return api('/admin/auth/reauth', { method: 'POST', body: { password }, token: accessToken })
}

export async function me(accessToken: string): Promise<StaffView> {
  const user = await api<StaffView>('/admin/auth/me', { token: accessToken })
  void loadPolicy()
  return user
}

export async function changeOwnPassword(accessToken: string, current: string, next: string) {
  await api<void>('/admin/auth/me/password', { method: 'PUT', body: { current, next }, token: accessToken })
}

export function mySessions(accessToken: string): Promise<AdminSessionInfo[]> {
  return api<AdminSessionInfo[]>('/admin/auth/sessions', { token: accessToken })
}

export async function revokeMySession(accessToken: string, sessionId: string) {
  await api<void>(`/admin/auth/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE', token: accessToken })
}

// ------------------------------------------------------------------ session policy (read synchronously by timers and forms)

let policy = { idleMinutes: 15, passwordMinLength: 12 }
let policyRequest: Promise<void> | null = null

/** GET /admin/auth/policy — fetched once per page load; HelaMart's defaults until it arrives. */
function loadPolicy() {
  policyRequest ??= api<typeof policy>('/admin/auth/policy')
    .then((p) => void (policy = p))
    .catch(() => void (policyRequest = null))
  return policyRequest
}

/** Session policy the client needs for its inactivity timer and password rules. */
export function sessionPolicy() {
  if (typeof window !== 'undefined') void loadPolicy()
  return policy
}

// ------------------------------------------------------------------ demo authenticator

const demoCodes = new Map<string, { code: string; until: number; email: string }>()
const demoInflight = new Set<string>()

/**
 * PROTOTYPE ONLY — stands in for the staff member's authenticator app so testers can sign in.
 * Shown when `adminDemoMode` is on, and only works against a development API (Auth:AdminDemoCodes);
 * never enable either in production. Called every second: returns the last code fetched and
 * asks the API for a fresh one when it has expired.
 */
export function demoAuthenticatorCode(challengeId: string) {
  const cached = demoCodes.get(challengeId)
  const now = Date.now()
  if ((!cached || cached.until <= now) && !demoInflight.has(challengeId)) {
    demoInflight.add(challengeId)
    api<{ code: string; secondsLeft: number; email: string }>('/admin/auth/demo-code', { query: { challenge: challengeId } })
      .then((r) => void demoCodes.set(challengeId, { code: r.code, until: Date.now() + r.secondsLeft * 1000, email: r.email }))
      .catch(() => undefined)
      .finally(() => demoInflight.delete(challengeId))
  }
  if (!cached || cached.until <= now) return null
  return { code: cached.code, secondsLeft: Math.ceil((cached.until - now) / 1000), email: cached.email }
}
