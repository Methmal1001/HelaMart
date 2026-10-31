import type { AuditSeverity, Branch, Permission, Role, Scope, StaffUser, StaffView, Tenant } from '~/types/admin'
import { CHAIN_ONLY_PERMISSIONS, ROLE_IDS, TENANT_PERMISSIONS, permissionLabel, permissionsFor } from '~/data/admin/permissions'
import { base64UrlEncode, decodeJwt } from '~/utils/jwt'
import { ApiError } from '../apiError'
import { hash, randomId } from '../mock/server'
import { readAdminDb, writeAdminDb, type AdminDb, type AdminSessionRecord } from './db'

/**
 * Server-side security for the back-office API (mock — runs in the browser).
 * Layers, applied on every call:
 *  1. authenticate: token signature/expiry, live session, idle/absolute limits,
 *     active staff account, supermarket not banned.
 *  2. scope: platform vs supermarket, tenant isolation, branch restriction.
 *  3. permission + password step-up for sensitive actions.
 *  4. restricted supermarkets are read-only.
 */

const ADMIN_SECRET = 'helamart-admin-mock-key::not-for-production'

export const ADMIN_POLICY = {
  accessTtlMs: 10 * 60 * 1000,
  stepUpMs: 5 * 60 * 1000,
  challengeTtlMs: 5 * 60 * 1000,
  maxMfaAttempts: 5,
  maxReauthFailures: 5,
}

// ------------------------------------------------------------------ two-factor (TOTP-style)

export function totp(secret: string, at = Date.now()) {
  const step = Math.floor(at / 30000)
  return (parseInt(hash(`${secret}:${step}`).slice(0, 8), 16) % 1_000_000).toString().padStart(6, '0')
}

export function verifyTotp(secret: string, code: string) {
  const c = code.replace(/\s+/g, '')
  const now = Date.now()
  return [0, -30000].some((d) => totp(secret, now + d) === c)
}

// ------------------------------------------------------------------ roles & permissions

const NO_ROLE: Role = { id: 'none', name: 'No role', description: '', permissions: [], scope: 'tenant', tenantId: null, system: false, level: 0, branchScoped: false, createdAt: '' }

export function roleOf(db: AdminDb, staff: StaffUser): Role {
  return db.roles.find((r) => r.id === staff.roleId) ?? NO_ROLE
}

/** Role + individual grants, limited to the permissions valid for the person's scope. */
export function effectivePermissions(db: AdminDb, staff: StaffUser): Permission[] {
  const scope: Scope = staff.tenantId ? 'tenant' : 'platform'
  const set = new Set<Permission>([...rolePermissions(db, roleOf(db, staff), staff.tenantId), ...staff.extraPermissions])
  const list = permissionsFor(scope).filter((p) => set.has(p))
  // Branch staff never hold chain-wide settings, whatever they were granted.
  return staff.tenantId && staff.branchIds.length ? list.filter((p) => !CHAIN_ONLY_PERMISSIONS.includes(p as never)) : list
}

/** A role's permissions in one supermarket (its admin can tailor the built-in Branch Manager role). */
export function rolePermissions(db: AdminDb, role: Role, tenantId: string | null): Permission[] {
  if (role.id === ROLE_IDS.branchManager && tenantId) {
    const own = db.tenants.find((t) => t.id === tenantId)?.branchManagerPermissions
    if (own) return own
  }
  return role.permissions
}

export function toStaffView(db: AdminDb, s: StaffUser, session?: AdminSessionRecord): StaffView {
  const { mfaSecret: _s, passwordHash: _p, ...safe } = s
  const now = Date.now()
  const role = roleOf(db, s)
  // A Super Admin managing a supermarket sees that supermarket's portal with chain-admin access.
  const acting = !s.tenantId && session?.actingTenantId ? db.tenants.find((t) => t.id === session.actingTenantId) : undefined
  if (acting) {
    return {
      ...safe,
      tenantId: acting.id,
      branchIds: [],
      roleName: `${role.name} · managing`,
      roleLevel: role.level,
      effectivePermissions: [...TENANT_PERMISSIONS],
      activeSessions: db.sessions.filter((x) => x.staffId === s.id && !x.revoked && x.expiresAt > now).length,
      tenantName: acting.name,
      tenantStatus: acting.status,
      tenantStatusReason: acting.statusReason,
      branchNames: [],
      acting: { tenantId: acting.id, tenantName: acting.name, homeRoleName: role.name },
    }
  }
  const tenant = s.tenantId ? db.tenants.find((t) => t.id === s.tenantId) : null
  return {
    ...safe,
    roleName: role.name,
    roleLevel: role.level,
    effectivePermissions: effectivePermissions(db, s),
    activeSessions: db.sessions.filter((x) => x.staffId === s.id && !x.revoked && x.expiresAt > now).length,
    tenantName: tenant?.name ?? null,
    tenantStatus: tenant?.status ?? null,
    tenantStatusReason: tenant?.statusReason,
    branchNames: s.branchIds.map((id) => db.branches.find((b) => b.id === id)?.name ?? id),
  }
}

/** Throws if a supermarket's staff may not sign in / keep a session. */
export function assertTenantAccessible(tenant: Tenant | undefined) {
  if (!tenant) throw new ApiError(401, 'This supermarket no longer exists on HelaMart.', 'TENANT_BLOCKED')
  if (tenant.status === 'banned') throw new ApiError(403, `${tenant.name} has been banned from HelaMart. Contact HelaMart partner support.`, 'TENANT_BANNED')
  if (tenant.status !== 'active' && tenant.status !== 'restricted') throw new ApiError(403, `${tenant.name} is not active on HelaMart.`, 'TENANT_BLOCKED')
}

// ------------------------------------------------------------------ tokens & sessions

function signAccess(staff: StaffUser, sessionId: string, now = Date.now()) {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const exp = now + ADMIN_POLICY.accessTtlMs
  const payload = base64UrlEncode(
    JSON.stringify({ iss: 'helamart-admin', sub: staff.id, sid: sessionId, tid: staff.tenantId, typ: 'admin', iat: Math.floor(now / 1000), exp: Math.floor(exp / 1000), jti: randomId(8) }),
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
    actingTenantId: keep?.actingTenantId,
  }
  db.sessions.push(session)
  const access = signAccess(staff, session.id, now)
  return { session, tokens: { accessToken: access.token, refreshToken, accessExpiresAt: access.expiresAt, refreshExpiresAt: session.expiresAt } }
}

export interface AdminContext {
  db: AdminDb
  staff: StaffUser
  session: AdminSessionRecord
  role: Role
  permissions: Set<Permission>
  scope: Scope
  tenant: Tenant | null
  /** HelaMart Super Admin working inside a supermarket's portal. */
  acting: boolean
}

function endSession(db: AdminDb, session: AdminSessionRecord, err: ApiError): never {
  session.revoked = true
  writeAdminDb(db)
  throw err
}

/** Validate an admin access token and everything behind it. */
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
  if (now - session.lastSeenAt > db.settings.security.sessionIdleMinutes * 60e3) endSession(db, session, new ApiError(401, 'You were signed out after a period of inactivity.', 'SESSION_IDLE'))
  const staff = db.staff.find((s) => s.id === claims.sub)
  if (!staff || staff.status !== 'active') endSession(db, session, new ApiError(401, 'This account is no longer active.', 'ACCOUNT_INACTIVE'))
  let tenant: Tenant | null = null
  if (staff.tenantId) {
    tenant = db.tenants.find((t) => t.id === staff.tenantId) ?? null
    try {
      assertTenantAccessible(tenant ?? undefined)
    } catch (e) {
      endSession(db, session, new ApiError(401, (e as ApiError).message, (e as ApiError).code))
    }
  }
  const role = roleOf(db, staff)
  let scope: Scope = staff.tenantId ? 'tenant' : 'platform'
  let permissions = new Set(effectivePermissions(db, staff))
  let acting = false
  if (!staff.tenantId && session.actingTenantId) {
    const t = db.tenants.find((x) => x.id === session.actingTenantId)
    if (role.id === ROLE_IDS.superAdmin && t && t.status !== 'banned') {
      // Full chain-admin access to that one supermarket, for as long as the mode is on.
      tenant = t
      scope = 'tenant'
      permissions = new Set(TENANT_PERMISSIONS)
      acting = true
    } else session.actingTenantId = undefined
  }
  session.lastSeenAt = now
  writeAdminDb(db)
  return { db, staff, session, role, permissions, scope, tenant, acting }
}

export function requirePermission(ctx: AdminContext, ...perms: Permission[]) {
  const missing = perms.filter((p) => !ctx.permissions.has(p))
  if (missing.length) {
    audit(ctx.db, ctx, 'access.denied', missing.join(', '), 'Attempted an action without permission', 'warning')
    writeAdminDb(ctx.db)
    throw new ApiError(403, `You don’t have permission to do this (${missing.map(permissionLabel).join(', ')}).`, 'FORBIDDEN')
  }
}

export function requireStepUp(ctx: AdminContext) {
  if (ctx.session.stepUpUntil < Date.now()) throw new ApiError(403, 'Please confirm your password to continue.', 'STEP_UP_REQUIRED')
}

export const isSuperAdmin = (ctx: AdminContext) => ctx.role.id === ROLE_IDS.superAdmin

export function requirePlatform(ctx: AdminContext) {
  if (ctx.scope !== 'platform') throw new ApiError(403, 'This is a HelaMart head-office function.', 'FORBIDDEN')
}

/** Supermarket staff only; returns their supermarket. */
export function requireTenant(ctx: AdminContext): Tenant {
  if (ctx.scope !== 'tenant' || !ctx.tenant) throw new ApiError(403, 'Open a supermarket account to do this.', 'FORBIDDEN')
  return ctx.tenant
}

/** Restricted supermarkets can sign in and look, but not change anything. */
export function requireWritable(ctx: AdminContext) {
  const t = requireTenant(ctx)
  if (t.status === 'restricted') {
    throw new ApiError(403, `HelaMart has restricted ${t.name}: ${t.statusReason ?? 'see partner support'}. Changes are disabled until the restriction is lifted.`, 'TENANT_RESTRICTED')
  }
  return t
}

/** Branches this person may work with (all of the chain's branches for chain-level staff). */
export function allowedBranches(ctx: AdminContext): Branch[] {
  const t = requireTenant(ctx)
  const all = ctx.db.branches.filter((b) => b.tenantId === t.id)
  return ctx.staff.branchIds.length ? all.filter((b) => ctx.staff.branchIds.includes(b.id)) : all
}

export function allowedBranchIds(ctx: AdminContext) {
  return new Set(allowedBranches(ctx).map((b) => b.id))
}

/** Chain-level staff work across all branches. */
export const isChainLevel = (ctx: AdminContext) => ctx.scope === 'tenant' && ctx.staff.branchIds.length === 0

export function assertBranchAccess(ctx: AdminContext, branchId: string) {
  if (!allowedBranchIds(ctx).has(branchId)) throw new ApiError(403, 'You can only work with your own branch.', 'BRANCH_FORBIDDEN')
}

/** Tenant isolation: anything from another supermarket behaves as "not found". */
export function ownedOrNotFound<T extends { tenantId: string | null }>(ctx: AdminContext, record: T | undefined, what: string): T {
  if (!record || record.tenantId !== (ctx.tenant?.id ?? null)) throw new ApiError(404, `${what} not found.`)
  return record
}

export function assertGrantable(ctx: AdminContext, perms: Permission[]) {
  const over = perms.filter((p) => !ctx.permissions.has(p))
  if (over.length) throw new ApiError(403, `You can’t grant permissions you don’t have: ${over.map(permissionLabel).join(', ')}.`, 'ESCALATION')
}

export function assertCanManageLevel(ctx: AdminContext, targetLevel: number, what: string) {
  if (!isSuperAdmin(ctx) && targetLevel >= ctx.role.level) throw new ApiError(403, `Only someone more senior can manage ${what}.`, 'HIERARCHY')
}

// ------------------------------------------------------------------ audit trail

export function audit(
  db: AdminDb,
  ctx: Pick<AdminContext, 'staff'> | { staff: null; name: string; tenantId?: string | null } | null,
  action: string,
  target: string,
  details?: string,
  severity: AuditSeverity = 'info',
  tenantId?: string | null,
) {
  const actor = ctx && ctx.staff ? ctx.staff : null
  // While a Super Admin manages a supermarket, their actions land in that supermarket's log, clearly labelled.
  const actingTenant = ctx && 'acting' in ctx && (ctx as AdminContext).acting ? (ctx as AdminContext).tenant : null
  db.audit.push({
    id: `aud_${randomId(6)}`,
    at: new Date().toISOString(),
    tenantId: tenantId !== undefined ? tenantId : actingTenant ? actingTenant.id : actor ? actor.tenantId : ctx && 'tenantId' in ctx ? ctx.tenantId ?? null : null,
    actorId: actor?.id ?? null,
    actorName: actor ? (actingTenant ? `${actor.name} (HelaMart Super Admin)` : actor.name) : ctx && 'name' in ctx ? ctx.name : 'System',
    action,
    target,
    details,
    severity,
  })
}

export function sanitize(text: string, max = 500) {
  return text.replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, max)
}
