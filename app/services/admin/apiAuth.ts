import type { StaffView } from '~/types/admin'
import { api } from '../http'
import type { AdminLoginResult } from './auth'

/**
 * Back-office sign-in against the HelaMart API (`/api/admin/auth`): password,
 * then a 6-digit authenticator code (RFC 6238), then — when required — a new
 * password. 10-minute access tokens (aud `helamart-admin`) with rotated refresh tokens.
 */

export type MfaResult = AdminLoginResult | { passwordChangeRequired: true; reason: 'new' | 'expired' }

export const login = (email: string, password: string) =>
  api<{ challengeId: string }>('/admin/auth/login', { method: 'POST', body: { email: email.trim(), password } })

export const verifyMfa = (challengeId: string, code: string) =>
  api<MfaResult>('/admin/auth/mfa', { method: 'POST', body: { challengeId, code: code.replace(/\s/g, '') } })

export const completePasswordChange = (challengeId: string, newPassword: string) =>
  api<AdminLoginResult>('/admin/auth/password', { method: 'POST', body: { challengeId, newPassword } })

export const refresh = (refreshToken: string) => api<AdminLoginResult>('/admin/auth/refresh', { method: 'POST', body: { refreshToken } })

export const logout = (accessToken: string | null, refreshToken: string | null) =>
  api<void>('/admin/auth/logout', { method: 'POST', body: { refreshToken }, token: accessToken })

export const me = (accessToken: string) => api<StaffView>('/admin/auth/me', { token: accessToken })

/** Confirm the password again: unlocks sensitive actions (STEP_UP_REQUIRED) for 5 minutes. */
export const reauthenticate = (accessToken: string, password: string) =>
  api<{ stepUpUntil: number }>('/admin/auth/reauth', { method: 'POST', body: { password }, token: accessToken })

/** Heartbeat while the staff member is active. */
export const touch = (accessToken: string) => api<void>('/admin/auth/touch', { method: 'POST', token: accessToken })

export const policy = () => api<{ idleMinutes: number; passwordMinLength: number }>('/admin/auth/policy')

/** Development only (Auth:AdminDemoCodes): the current 2FA code, standing in for the authenticator app. */
export const demoCode = (challengeId: string) =>
  api<{ code: string; secondsLeft: number; email: string }>('/admin/auth/demo-code', { query: { challenge: challengeId }, timeoutMs: 4000 })

/** Super Admin works inside a supermarket's portal / returns to HelaMart control. */
export const startManaging = (accessToken: string, tenantId: string) =>
  api<void>(`/admin/platform/manage/${encodeURIComponent(tenantId)}`, { method: 'POST', token: accessToken })
export const stopManaging = (accessToken: string) => api<void>('/admin/platform/manage', { method: 'DELETE', token: accessToken })
