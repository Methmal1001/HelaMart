import type { AdminSessionInfo, AdminTokens, StaffView } from '~/types/admin'
import { staffPasswordRules } from '~/utils/validation'
import { ApiError } from '../apiError'
import { hash, hashPassword, latency, randomId } from '../mock/server'
import { readAdminDb, writeAdminDb } from './db'
import {
  ADMIN_POLICY,
  audit,
  authenticate,
  issueSession,
  toStaffView,
  totp,
  verifyTotp,
} from './security'

/**
 * Admin sign-in API (mock). Maps to:
 *   POST /admin/auth/login → POST /admin/auth/mfa → [POST /admin/auth/password] → session
 *   POST /admin/auth/refresh · /logout · /reauth · /touch · GET /admin/auth/me · /sessions
 */

export interface AdminLoginResult {
  user: StaffView
  tokens: AdminTokens
}

const GENERIC = 'Incorrect email or password.'

/** Step 1: password. Always continues to two-factor — never issues a session directly. */
export async function login(email: string, password: string): Promise<{ challengeId: string }> {
  await latency(350, 700)
  const key = email.trim().toLowerCase()
  const db = readAdminDb()
  const sec = db.settings.security
  const attempts = db.loginAttempts[key]
  if (attempts && attempts.count >= sec.maxLoginAttempts && attempts.until > Date.now()) {
    const mins = Math.ceil((attempts.until - Date.now()) / 60000)
    throw new ApiError(429, `Too many failed attempts. This account is locked for ${mins} more minute${mins === 1 ? '' : 's'}.`, 'LOCKED')
  }
  const staff = db.staff.find((s) => s.email === key)
  if (!staff || staff.passwordHash !== hashPassword(key, password)) {
    const count = (attempts && attempts.until > Date.now() ? attempts.count : 0) + 1
    db.loginAttempts[key] = { count, until: Date.now() + sec.lockoutMinutes * 60e3 }
    audit(db, { staff: null, name: key }, 'auth.login_failed', key, `Failed attempt ${count}/${sec.maxLoginAttempts}`, count >= sec.maxLoginAttempts ? 'critical' : 'warning')
    writeAdminDb(db)
    throw new ApiError(401, GENERIC, 'BAD_CREDENTIALS')
  }
  if (staff.status !== 'active') {
    audit(db, { staff }, 'auth.login_blocked', staff.name, 'Suspended account tried to sign in', 'warning')
    writeAdminDb(db)
    throw new ApiError(403, 'This account is suspended. Contact a Super Admin.', 'SUSPENDED')
  }
  delete db.loginAttempts[key]
  const challenge = { id: randomId(12), staffId: staff.id, expiresAt: Date.now() + ADMIN_POLICY.challengeTtlMs, attempts: 0 }
  db.challenges.push(challenge)
  writeAdminDb(db)
  return { challengeId: challenge.id }
}

/** Step 2: 6-digit authenticator code. */
export async function verifyMfa(
  challengeId: string,
  code: string,
  userAgent: string,
): Promise<AdminLoginResult | { passwordChangeRequired: true; reason: 'new' | 'expired' }> {
  await latency(250, 500)
  const db = readAdminDb()
  const ch = db.challenges.find((c) => c.id === challengeId)
  if (!ch || ch.expiresAt < Date.now()) throw new ApiError(401, 'Your sign-in attempt expired. Start again.', 'CHALLENGE_EXPIRED')
  const staff = db.staff.find((s) => s.id === ch.staffId)!
  if (!verifyTotp(staff.mfaSecret, code)) {
    ch.attempts++
    if (ch.attempts >= ADMIN_POLICY.maxMfaAttempts) db.challenges = db.challenges.filter((c) => c !== ch)
    audit(db, { staff }, 'auth.mfa_failed', staff.name, `Wrong code (${ch.attempts}/${ADMIN_POLICY.maxMfaAttempts})`, 'warning')
    writeAdminDb(db)
    throw new ApiError(401, ch.attempts >= ADMIN_POLICY.maxMfaAttempts ? 'Too many wrong codes. Start again.' : 'That code isn’t right. Check your authenticator app.', 'BAD_CODE')
  }
  ch.verified = true
  const expiryDays = db.settings.security.passwordExpiryDays
  const expired = expiryDays > 0 && Date.now() - Date.parse(staff.passwordChangedAt) > expiryDays * 864e5
  if (staff.mustChangePassword || expired) {
    ch.passwordChange = true
    ch.expiresAt = Date.now() + ADMIN_POLICY.challengeTtlMs
    writeAdminDb(db)
    return { passwordChangeRequired: true, reason: staff.mustChangePassword ? 'new' : 'expired' }
  }
  db.challenges = db.challenges.filter((c) => c !== ch)
  return finishLogin(db, staff.id, userAgent)
}

function finishLogin(db: ReturnType<typeof readAdminDb>, staffId: string, userAgent: string): AdminLoginResult {
  const staff = db.staff.find((s) => s.id === staffId)!
  staff.lastLoginAt = new Date().toISOString()
  const { tokens } = issueSession(db, staff, userAgent)
  audit(db, { staff }, 'auth.login', staff.name, 'Signed in with password + 2FA')
  writeAdminDb(db)
  return { user: toStaffView(db, staff), tokens }
}

/** Step 3 (when required): choose a new password, then the session is issued. */
export async function completePasswordChange(challengeId: string, newPassword: string, userAgent: string): Promise<AdminLoginResult> {
  await latency(300, 600)
  const db = readAdminDb()
  const ch = db.challenges.find((c) => c.id === challengeId && c.verified && c.passwordChange)
  if (!ch || ch.expiresAt < Date.now()) throw new ApiError(401, 'Your sign-in attempt expired. Start again.', 'CHALLENGE_EXPIRED')
  const staff = db.staff.find((s) => s.id === ch.staffId)!
  assertPasswordPolicy(db, staff.email, newPassword)
  if (staff.passwordHash === hashPassword(staff.email, newPassword)) throw new ApiError(422, 'Choose a password you haven’t used before.', 'PASSWORD_REUSED')
  staff.passwordHash = hashPassword(staff.email, newPassword)
  staff.passwordChangedAt = new Date().toISOString()
  staff.mustChangePassword = false
  db.challenges = db.challenges.filter((c) => c !== ch)
  audit(db, { staff }, 'auth.password_changed', staff.name, 'Password set at sign-in')
  return finishLogin(db, staff.id, userAgent)
}

export function assertPasswordPolicy(db: ReturnType<typeof readAdminDb>, email: string, pw: string) {
  const failed = staffPasswordRules(db.settings.security.passwordMinLength, email).filter((r) => !r.test(pw))
  if (failed.length) throw new ApiError(422, `Password rules not met: ${failed.map((f) => f.label.toLowerCase()).join(', ')}.`, 'WEAK_PASSWORD')
}

/** Rotate the refresh token. Reuse of an old token revokes the whole session family. */
export async function refresh(refreshToken: string): Promise<AdminLoginResult> {
  await latency(100, 250)
  const db = readAdminDb()
  const s = db.sessions.find((x) => x.refreshHash === hash(refreshToken))
  if (!s) throw new ApiError(401, 'Session not found.', 'SESSION_INVALID')
  if (s.revoked) {
    if (s.replacedBy) {
      db.sessions.forEach((x) => x.familyId === s.familyId && (x.revoked = true))
      const staff = db.staff.find((x) => x.id === s.staffId)
      audit(db, staff ? { staff } : null, 'auth.token_reuse', staff?.name ?? s.staffId, 'Old refresh token reused — all sessions in this family revoked', 'critical')
      writeAdminDb(db)
    }
    throw new ApiError(401, 'You have been signed out.', 'SESSION_REVOKED')
  }
  const now = Date.now()
  if (now > s.expiresAt) throw new ApiError(401, 'Your session has ended. Please sign in again.', 'SESSION_EXPIRED')
  if (now - s.lastSeenAt > db.settings.security.sessionIdleMinutes * 60e3) {
    s.revoked = true
    writeAdminDb(db)
    throw new ApiError(401, 'You were signed out after a period of inactivity.', 'SESSION_IDLE')
  }
  const staff = db.staff.find((x) => x.id === s.staffId)
  if (!staff || staff.status !== 'active') throw new ApiError(401, 'This account is no longer active.', 'ACCOUNT_INACTIVE')
  s.revoked = true
  // Same session id continues with a fresh token pair (keeps expiry + step-up state).
  db.sessions = db.sessions.filter((x) => x !== s)
  const { tokens, session } = issueSession(db, staff, s.userAgent, s.familyId, s)
  db.sessions.push({ ...s, id: `${s.id}~${randomId(4)}`, revoked: true, replacedBy: session.refreshHash })
  writeAdminDb(db)
  return { user: toStaffView(db, staff), tokens }
}

/** Heartbeat: records activity so an active admin isn't signed out for "inactivity". */
export async function touch(accessToken: string) {
  authenticate(accessToken)
}

export async function logout(accessToken: string | null, refreshToken: string | null) {
  await latency(60, 150)
  const db = readAdminDb()
  const s = refreshToken ? db.sessions.find((x) => x.refreshHash === hash(refreshToken)) : null
  if (s) {
    s.revoked = true
    const staff = db.staff.find((x) => x.id === s.staffId)
    if (staff) audit(db, { staff }, 'auth.logout', staff.name)
    writeAdminDb(db)
  }
  void accessToken
}

/** Confirm the password again to unlock sensitive actions for a few minutes. */
export async function reauthenticate(accessToken: string, password: string) {
  await latency(250, 500)
  const ctx = authenticate(accessToken)
  if (ctx.staff.passwordHash !== hashPassword(ctx.staff.email, password)) {
    const key = `reauth:${ctx.session.id}`
    const a = ctx.db.loginAttempts[key] ?? { count: 0, until: 0 }
    a.count++
    a.until = Date.now() + 15 * 60e3
    ctx.db.loginAttempts[key] = a
    audit(ctx.db, ctx, 'auth.reauth_failed', ctx.staff.name, `Wrong password (${a.count}/${ADMIN_POLICY.maxReauthFailures})`, 'warning')
    if (a.count >= ADMIN_POLICY.maxReauthFailures) {
      ctx.session.revoked = true
      audit(ctx.db, ctx, 'auth.forced_logout', ctx.staff.name, 'Too many failed password confirmations', 'critical')
      writeAdminDb(ctx.db)
      throw new ApiError(401, 'Too many failed attempts — you have been signed out.', 'SESSION_REVOKED')
    }
    writeAdminDb(ctx.db)
    throw new ApiError(401, 'Incorrect password.', 'BAD_PASSWORD')
  }
  delete ctx.db.loginAttempts[`reauth:${ctx.session.id}`]
  ctx.session.stepUpUntil = Date.now() + ADMIN_POLICY.stepUpMs
  audit(ctx.db, ctx, 'auth.reauth', ctx.staff.name, 'Password confirmed for a sensitive action')
  writeAdminDb(ctx.db)
  return { stepUpUntil: ctx.session.stepUpUntil }
}

export async function me(accessToken: string): Promise<StaffView> {
  await latency(60, 150)
  const ctx = authenticate(accessToken)
  return toStaffView(ctx.db, ctx.staff)
}

export async function changeOwnPassword(accessToken: string, current: string, next: string) {
  await latency(300, 600)
  const ctx = authenticate(accessToken)
  if (ctx.staff.passwordHash !== hashPassword(ctx.staff.email, current)) throw new ApiError(401, 'Your current password is incorrect.', 'BAD_PASSWORD')
  assertPasswordPolicy(ctx.db, ctx.staff.email, next)
  if (current === next) throw new ApiError(422, 'Choose a different password.', 'PASSWORD_REUSED')
  ctx.staff.passwordHash = hashPassword(ctx.staff.email, next)
  ctx.staff.passwordChangedAt = new Date().toISOString()
  // Sign out every other device.
  ctx.db.sessions.forEach((s) => s.staffId === ctx.staff.id && s.id !== ctx.session.id && (s.revoked = true))
  audit(ctx.db, ctx, 'auth.password_changed', ctx.staff.name, 'Changed own password; other sessions signed out', 'warning')
  writeAdminDb(ctx.db)
}

export async function mySessions(accessToken: string): Promise<AdminSessionInfo[]> {
  await latency(80, 200)
  const ctx = authenticate(accessToken)
  const now = Date.now()
  return ctx.db.sessions
    .filter((s) => s.staffId === ctx.staff.id && !s.revoked && s.expiresAt > now)
    .map((s) => ({
      id: s.id,
      createdAt: new Date(s.createdAt).toISOString(),
      lastSeenAt: new Date(s.lastSeenAt).toISOString(),
      expiresAt: new Date(s.expiresAt).toISOString(),
      userAgent: s.userAgent,
      current: s.id === ctx.session.id,
    }))
}

export async function revokeMySession(accessToken: string, sessionId: string) {
  await latency(80, 200)
  const ctx = authenticate(accessToken)
  const s = ctx.db.sessions.find((x) => x.id === sessionId && x.staffId === ctx.staff.id)
  if (!s) throw new ApiError(404, 'Session not found.')
  s.revoked = true
  audit(ctx.db, ctx, 'auth.session_revoked', ctx.staff.name, 'Signed out another device')
  writeAdminDb(ctx.db)
}

/** Public: session policy the client needs for its inactivity timer. */
export function sessionPolicy() {
  const s = readAdminDb().settings.security
  return { idleMinutes: s.sessionIdleMinutes, passwordMinLength: s.passwordMinLength }
}

/**
 * PROTOTYPE ONLY — stands in for the staff member's authenticator app so testers
 * can sign in. Disabled when `adminDemoMode` is false; never ship this.
 */
export function demoAuthenticatorCode(challengeId: string) {
  const db = readAdminDb()
  const ch = db.challenges.find((c) => c.id === challengeId)
  const staff = ch && db.staff.find((s) => s.id === ch.staffId)
  if (!staff) return null
  return { code: totp(staff.mfaSecret), secondsLeft: 30 - (Math.floor(Date.now() / 1000) % 30), email: staff.email }
}
