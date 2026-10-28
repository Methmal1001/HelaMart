import type { Permission, Role, StaffUser, StaffView, AuditSeverity } from '~/types/admin'
import { ALL_PERMISSIONS, ROLE_IDS, permissionLabel } from '~/data/admin/permissions'
import { base64UrlEncode, decodeJwt } from '~/utils/jwt'
import { ApiError } from '../apiError'
import { hash, randomId } from '../mock/server'
import { readAdminDb, writeAdminDb, type AdminDb, type AdminSessionRecord } from './db'

/**
 * Server-side security for the admin API (mock — runs in the browser).
 * Every admin endpoint goes through `authenticate` + `requirePermission`,
 * so hiding a button in the UI is never the only protection.
 */

const ADMIN_SECRET = 'helamart-admin-mock-key::not-for-production'

export const ADMIN_POLICY = {
  /** Admin access tokens are short-lived. */
  accessTtlMs: 10 * 60 * 1000,
  /** Password re-confirmation unlocks sensitive actions for 5 minutes. */
  stepUpMs: 5 * 60 * 1000,
  challengeTtlMs: 5 * 60 * 1000,
  maxMfaAttempts: 5,
  maxReauthFailures: 5,
}

// ------------------------------------------------------------------ two-factor (TOTP-style)

/** 6-digit code that changes every 30 seconds (mock of RFC 6238 TOTP). */
export function totp(secret: string, at = Date.now()) {
  const step = Math.floor(at / 30000)
  return (parseInt(hash(`${secret}:${step}`).slice(0, 8), 16) % 1_000_000).toString().padStart(6, '0')
}

export function verifyTotp(secret: string, code: string) {
  const c = code.replace(/\s+/g, '')
  const now = Date.now()
  // Accept the current and previous window to allow for clock drift.
  return [0, -30000].some((d) => totp(secret, now + d) === c)
}

// ------------------------------------------------------------------ permissions

export function roleOf(db: AdminDb, staff: StaffUser): Role {
  return db.roles.find((r) => r.id === staff.roleId) ?? { id: 'none', name: 'No role', description: '', permissions: [], system: false, level: 0, createdAt: '' }
}

export function effectivePermissions(db: AdminDb, staff: StaffUser): Permission[] {
  const set = new Set<Permission>([...roleOf(db, staff).permissions, ...staff.extraPermissions])
  return ALL_PERMISSIONS.filter((p) => set.has(p))
}

export function toStaffView(db: AdminDb, s: StaffUser): StaffView {
  const { mfaSecret: _s, passwordHash: _p, ...safe } = s
  const now = Date.now()
  return {
    ...safe,
    roleName: roleOf(db, s).name,
    effectivePermissions: effectivePermissions(db, s),
    activeSessions: db.sessions.filter((x) => x.staffId === s.id && !x.revoked && x.expiresAt > now).length,
  }
}

// ------------------------------------------------------------------ tokens & sessions

function signAccess(staff: StaffUser, sessionId: string, now = Date.now()) {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const exp = now + ADMIN_POLICY.accessTtlMs
  const payload = base64UrlEncode(
    JSON.stringify({ iss: 'helamart-admin', sub: staff.id, sid: sessionId, typ: 'admin', iat: Math.floor(now / 1000), exp: Math.floor(exp / 1000), jti: randomId(8) }),
  )
  return { token: `${header}.${payload}.${hash(`${header}.${payload}.${ADMIN_SECRET}`)}`, expiresAt: exp }
}

export function issueSession(db: AdminDb, staff: StaffUser, userAgent: string, familyId = randomId(8), keep?: AdminSessionRecord) {
  const now = Date.now()
  const refreshToken = randomId(32)
  const session: AdminSessionRecord = {
    id: keep?.id ?? randomId(10),
    staffId: staff.id,
    refreshHash: hash(refreshToken),
    createdAt: keep?.createdAt ?? now,
    lastSeenAt: keep?.lastSeenAt ?? now,
    expiresAt: keep?.expiresAt ?? now + db.settings.security.sessionMaxHours * 3600e3,
    stepUpUntil: keep?.stepUpUntil ?? 0,
    revoked: false,
    familyId,
    userAgent: userAgent.slice(0, 160),
  }
  db.sessions.push(session)
  const access = signAccess(staff, session.id, now)
  return {
    session,
    tokens: { accessToken: access.token, refreshToken, accessExpiresAt: access.expiresAt, refreshExpiresAt: session.expiresAt },
  }
}

export interface AdminContext {
  db: AdminDb
  staff: StaffUser
  session: AdminSessionRecord
  role: Role
  permissions: Set<Permission>
}

/** Validate an admin access token and the session behind it. */
export function authenticate(token: string | null | undefined): AdminContext {
  if (!token) throw new ApiError(401, 'Please sign in.', 'NO_TOKEN')
  const [h, p, sig] = token.split('.')
  if (!h || !p || !sig || hash(`${h}.${p}.${ADMIN_SECRET}`) !== sig) throw new ApiError(401, 'Invalid session.', 'BAD_TOKEN')
  const claims = decodeJwt<{ sub: string; sid: string; typ: string; exp: number }>(token)
  if (!claims || claims.typ !== 'admin') throw new ApiError(401, 'Invalid session.', 'BAD_TOKEN')
  if (claims.exp * 1000 <= Date.now()) throw new ApiError(401, 'Session token expired.', 'TOKEN_EXPIRED')

  const db = readAdminDb()
  const session = db.sessions.find((s) => s.id === claims.sid)
  if (!session || session.revoked) throw new ApiError(401, 'You have been signed out.', 'SESSION_REVOKED')
  const now = Date.now()
  if (now > session.expiresAt) throw new ApiError(401, 'Your session has ended. Please sign in again.', 'SESSION_EXPIRED')
  if (now - session.lastSeenAt > db.settings.security.sessionIdleMinutes * 60e3) {
    session.revoked = true
    writeAdminDb(db)
    throw new ApiError(401, 'You were signed out after a period of inactivity.', 'SESSION_IDLE')
  }
  const staff = db.staff.find((s) => s.id === claims.sub)
  if (!staff || staff.status !== 'active') {
    session.revoked = true
    writeAdminDb(db)
    throw new ApiError(401, 'This account is no longer active.', 'ACCOUNT_INACTIVE')
  }
  session.lastSeenAt = now
  writeAdminDb(db)
  return { db, staff, session, role: roleOf(db, staff), permissions: new Set(effectivePermissions(db, staff)) }
}

export function requirePermission(ctx: AdminContext, ...perms: Permission[]) {
  const missing = perms.filter((p) => !ctx.permissions.has(p))
  if (missing.length) {
    audit(ctx.db, ctx, 'access.denied', missing.join(', '), 'Attempted an action without permission', 'warning')
    writeAdminDb(ctx.db)
    throw new ApiError(403, `You don’t have permission to do this (${missing.map(permissionLabel).join(', ')}).`, 'FORBIDDEN')
  }
}

/** Sensitive actions need a recent password confirmation. */
export function requireStepUp(ctx: AdminContext) {
  if (ctx.session.stepUpUntil < Date.now()) {
    throw new ApiError(403, 'Please confirm your password to continue.', 'STEP_UP_REQUIRED')
  }
}

export const isSuperAdmin = (ctx: AdminContext) => ctx.role.id === ROLE_IDS.superAdmin

/** You may only hand out permissions you hold yourself. */
export function assertGrantable(ctx: AdminContext, perms: Permission[]) {
  const over = perms.filter((p) => !ctx.permissions.has(p))
  if (over.length) {
    throw new ApiError(403, `You can’t grant permissions you don’t have: ${over.map(permissionLabel).join(', ')}.`, 'ESCALATION')
  }
}

/** Staff may only manage people/roles strictly below their own level (Super Admin manages everyone). */
export function assertCanManageLevel(ctx: AdminContext, targetLevel: number, what: string) {
  if (!isSuperAdmin(ctx) && targetLevel >= ctx.role.level) {
    throw new ApiError(403, `Only someone more senior can manage ${what}.`, 'HIERARCHY')
  }
}

// ------------------------------------------------------------------ audit trail

export function audit(
  db: AdminDb,
  ctx: Pick<AdminContext, 'staff'> | { staff: null; name: string } | null,
  action: string,
  target: string,
  details?: string,
  severity: AuditSeverity = 'info',
) {
  const actor = ctx && ctx.staff ? ctx.staff : null
  db.audit.push({
    id: `aud_${randomId(6)}`,
    at: new Date().toISOString(),
    actorId: actor?.id ?? null,
    actorName: actor?.name ?? (ctx && 'name' in ctx ? ctx.name : 'System'),
    action,
    target,
    details,
    severity,
  })
}

export function sanitize(text: string, max = 500) {
  return text.replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, max)
}
