import type { Branch, Customer, PlatformDashboard, PlatformSettings, StaffView, Tenant, TenantStatus } from '~/types/admin'
import { ROLE_IDS } from '~/data/admin/permissions'
import { standardCategoriesFor } from '~/data/admin/seed'
import { PROVINCE_OF, type District } from '~/data/sriLanka'
import { EMAIL_RE, isSriLankanMobile } from '~/utils/validation'
import { ApiError } from '../apiError'
import { hashPassword, latency, randomId } from '../mock/server'
import { resetAdminDb } from './db'
import { audit, authenticate, isSuperAdmin, requirePermission, requirePlatform, requireStepUp, sanitize, toStaffView, type AdminContext } from './security'
import { generateTempPassword, nowIso, run } from './common'

/**
 * HelaMart head-office API — only platform staff can call these.
 * Supermarkets are reviewed, moderated and supported from here.
 */

function platform(ctx: AdminContext) {
  requirePlatform(ctx)
  return ctx
}

export interface TenantSummary extends Tenant {
  branchCount: number
  adminCount: number
  orders30d: number
  gmv30dCents: number
  customers: number
}

function summarise(ctx: AdminContext, t: Tenant): TenantSummary {
  const now = Date.now()
  const orders = ctx.db.orders.filter((o) => o.tenantId === t.id && now - Date.parse(o.createdAt) < 30 * 864e5 && o.status !== 'cancelled' && o.status !== 'refunded')
  return {
    ...t,
    branchCount: ctx.db.branches.filter((b) => b.tenantId === t.id).length,
    adminCount: ctx.db.staff.filter((s) => s.tenantId === t.id && s.roleId === ROLE_IDS.chainAdmin).length,
    orders30d: orders.length,
    gmv30dCents: orders.reduce((s, o) => s + o.breakdown.totalCents, 0),
    customers: ctx.db.customers.filter((c) => c.tenantIds.includes(t.id)).length,
  }
}

// ================================================================== dashboard

export function getPlatformDashboard(token: string): Promise<PlatformDashboard> {
  return run(token, (raw) => {
    const ctx = platform(raw)
    requirePermission(ctx, 'platform.dashboard')
    const { db } = ctx
    const now = Date.now()
    const live = db.orders.filter((o) => o.status !== 'cancelled' && o.status !== 'refunded')
    const last30 = live.filter((o) => now - Date.parse(o.createdAt) < 30 * 864e5)
    const gmv = last30.reduce((s, o) => s + o.breakdown.totalCents, 0)
    const commission = last30.reduce((s, o) => s + Math.round((o.breakdown.totalCents * (db.tenants.find((t) => t.id === o.tenantId)?.commissionPercent ?? 0)) / 100), 0)
    const statuses: TenantStatus[] = ['active', 'pending', 'restricted', 'banned', 'rejected']
    const provinces = new Map<string, number>()
    for (const c of db.customers) {
      const p = PROVINCE_OF[c.district as District] ?? 'Not set'
      provinces.set(p, (provinces.get(p) ?? 0) + 1)
    }
    return {
      tenantsByStatus: statuses.map((s) => ({ status: s, count: db.tenants.filter((t) => t.status === s).length })),
      pendingApplications: db.tenants.filter((t) => t.status === 'pending').map((t) => ({ id: t.id, name: t.name, reference: t.reference, district: t.district, createdAt: t.createdAt })),
      branches: db.branches.length,
      customers: db.customers.length,
      newCustomers30d: db.customers.filter((c) => now - Date.parse(c.createdAt) < 30 * 864e5).length,
      gmv30dCents: gmv,
      commission30dCents: commission,
      orders30d: last30.length,
      gmvByDay: Array.from({ length: 14 }, (_, i) => {
        const d = new Date(now - (13 - i) * 864e5)
        const day = live.filter((o) => new Date(o.createdAt).toDateString() === d.toDateString())
        return { date: d.toISOString().slice(0, 10), cents: day.reduce((s, o) => s + o.breakdown.totalCents, 0), orders: day.length }
      }),
      topTenants: db.tenants
        .filter((t) => t.status !== 'pending' && t.status !== 'rejected')
        .map((t) => summarise(ctx, t))
        .sort((a, b) => b.gmv30dCents - a.gmv30dCents)
        .map((t) => ({ id: t.id, name: t.name, status: t.status, branches: t.branchCount, orders: t.orders30d, cents: t.gmv30dCents })),
      customersByProvince: [...provinces.entries()].map(([province, count]) => ({ province, count })).sort((a, b) => b.count - a.count),
    }
  })
}

// ================================================================== supermarkets

export function listTenants(token: string): Promise<TenantSummary[]> {
  return run(token, (raw) => {
    const ctx = platform(raw)
    requirePermission(ctx, 'tenants.view')
    return ctx.db.tenants.map((t) => summarise(ctx, t)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  })
}

export interface TenantDetail {
  tenant: TenantSummary
  branches: (Branch & { managerName: string | null })[]
  admins: StaffView[]
  staffCount: number
}

export function getTenant(token: string, id: string): Promise<TenantDetail> {
  return run(token, (raw) => {
    const ctx = platform(raw)
    requirePermission(ctx, 'tenants.view')
    const t = ctx.db.tenants.find((x) => x.id === id)
    if (!t) throw new ApiError(404, 'Supermarket not found.')
    return {
      tenant: summarise(ctx, t),
      branches: ctx.db.branches.filter((b) => b.tenantId === id).map((b) => ({ ...b, managerName: ctx.db.staff.find((s) => s.id === b.managerId)?.name ?? null })),
      admins: ctx.db.staff.filter((s) => s.tenantId === id && s.roleId === ROLE_IDS.chainAdmin).map((s) => toStaffView(ctx.db, s)),
      staffCount: ctx.db.staff.filter((s) => s.tenantId === id).length,
    }
  })
}

export function verifyDocument(token: string, tenantId: string, kind: Tenant['documents'][number]['kind'], verified: boolean): Promise<Tenant> {
  return run(token, (raw) => {
    const ctx = platform(raw)
    requirePermission(ctx, 'tenants.review')
    const t = ctx.db.tenants.find((x) => x.id === tenantId)
    const doc = t?.documents.find((d) => d.kind === kind)
    if (!t || !doc) throw new ApiError(404, 'Document not found.')
    doc.verified = verified
    audit(ctx.db, ctx, verified ? 'tenant.document_verified' : 'tenant.document_unverified', t.name, kind.replace('_', ' '), 'info', t.id)
    return t
  })
}

function createChainAdminAccount(ctx: AdminContext, t: Tenant, input: { name: string; email: string; phone: string }) {
  const email = input.email.trim().toLowerCase()
  if (sanitize(input.name, 80).length < 3) throw new ApiError(422, 'Enter the admin’s full name.')
  if (!EMAIL_RE.test(email)) throw new ApiError(422, 'Enter a valid email address.')
  if (input.phone && !isSriLankanMobile(input.phone)) throw new ApiError(422, 'Enter a Sri Lankan mobile number.')
  if (ctx.db.staff.some((s) => s.email === email)) throw new ApiError(409, 'A staff account with this email already exists.')
  const tempPassword = generateTempPassword()
  const staff = {
    id: `stf_${randomId(5)}`, name: sanitize(input.name, 80), email, phone: input.phone.trim() || undefined, title: 'Owner / Chain Admin',
    tenantId: t.id, branchIds: [], roleId: ROLE_IDS.chainAdmin, extraPermissions: [], status: 'active' as const,
    mfaSecret: `${randomId(10)}-totp`, passwordHash: hashPassword(email, tempPassword), passwordChangedAt: nowIso(), mustChangePassword: true,
    createdAt: nowIso(), createdBy: ctx.staff.id, avatarColor: t.brandColor,
  }
  ctx.db.staff.push(staff)
  return { staff: toStaffView(ctx.db, staff), tempPassword }
}

/** Approve a pending application: activates the supermarket, opens its first branch and creates the chain admin. */
export function approveTenant(token: string, id: string, input: { commissionPercent: number; plan: Tenant['plan'] }): Promise<{ tenant: Tenant; admin: StaffView; tempPassword: string }> {
  return run(token, (raw) => {
    const ctx = platform(raw)
    requirePermission(ctx, 'tenants.review')
    requireStepUp(ctx)
    const t = ctx.db.tenants.find((x) => x.id === id)
    if (!t) throw new ApiError(404, 'Supermarket not found.')
    if (t.status !== 'pending') throw new ApiError(409, 'Only pending applications can be approved.')
    if (!t.documents.every((d) => d.verified)) throw new ApiError(409, 'Verify every document before approving.')
    if (!(input.commissionPercent >= 0 && input.commissionPercent <= 20)) throw new ApiError(422, 'Commission must be 0–20%.')
    Object.assign(t, { status: 'active', statusReason: undefined, statusChangedAt: nowIso(), statusChangedBy: ctx.staff.name, approvedAt: nowIso(), commissionPercent: input.commissionPercent, plan: input.plan })
    const code = t.name.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase()
    ctx.db.branches.push({
      id: `br_${randomId(5)}`, tenantId: t.id, name: t.firstBranch.name, code: `${code}-001`, district: t.firstBranch.district, city: t.firstBranch.city,
      address: t.hqAddress, phone: t.phone, openingHours: t.defaultHours, status: 'open', deliveryRadiusKm: 8, createdAt: nowIso(),
    })
    // Every new supermarket starts with HelaMart's standard categories (it can customise them).
    ctx.db.categories.push(...standardCategoriesFor(t.id))
    const { staff, tempPassword } = createChainAdminAccount(ctx, t, { name: t.ownerName, email: t.email, phone: '' })
    audit(ctx.db, ctx, 'tenant.approve', t.name, `Approved · ${input.plan} plan · ${input.commissionPercent}% commission · chain admin ${staff.email}`, 'warning', t.id)
    return { tenant: t, admin: staff, tempPassword }
  }, [500, 900])
}

export function rejectTenant(token: string, id: string, reason: string): Promise<Tenant> {
  return run(token, (raw) => {
    const ctx = platform(raw)
    requirePermission(ctx, 'tenants.review')
    const t = ctx.db.tenants.find((x) => x.id === id)
    if (!t) throw new ApiError(404, 'Supermarket not found.')
    if (t.status !== 'pending') throw new ApiError(409, 'Only pending applications can be rejected.')
    if (!sanitize(reason)) throw new ApiError(422, 'Give a reason — the applicant will see it.')
    Object.assign(t, { status: 'rejected', statusReason: sanitize(reason, 300), statusChangedAt: nowIso(), statusChangedBy: ctx.staff.name })
    audit(ctx.db, ctx, 'tenant.reject', t.name, t.statusReason, 'warning', t.id)
    return t
  })
}

/** Restrict (read-only, hidden from shoppers), ban (blocked entirely) or reinstate a supermarket. */
export function moderateTenant(token: string, id: string, action: 'restrict' | 'ban' | 'reinstate', reason: string): Promise<Tenant> {
  return run(token, (raw) => {
    const ctx = platform(raw)
    requirePermission(ctx, 'tenants.moderate')
    requireStepUp(ctx)
    const t = ctx.db.tenants.find((x) => x.id === id)
    if (!t) throw new ApiError(404, 'Supermarket not found.')
    const allowed: Record<typeof action, TenantStatus[]> = { restrict: ['active'], ban: ['active', 'restricted'], reinstate: ['restricted', 'banned'] }
    if (!allowed[action].includes(t.status)) throw new ApiError(409, `A ${t.status} supermarket can’t be ${action === 'reinstate' ? 'reinstated' : `${action}ed`}.`)
    if (!sanitize(reason)) throw new ApiError(422, 'Give a reason — it is shown to the supermarket.')
    if (action === 'ban' && !isSuperAdmin(ctx)) throw new ApiError(403, 'Only a Super Admin can ban a supermarket.', 'FORBIDDEN')
    const next: TenantStatus = action === 'restrict' ? 'restricted' : action === 'ban' ? 'banned' : 'active'
    Object.assign(t, { status: next, statusReason: next === 'active' ? undefined : sanitize(reason, 300), statusChangedAt: nowIso(), statusChangedBy: ctx.staff.name })
    // A ban ends every session of the supermarket's staff immediately.
    if (next === 'banned') {
      const staffIds = new Set(ctx.db.staff.filter((s) => s.tenantId === t.id).map((s) => s.id))
      ctx.db.sessions.forEach((s) => staffIds.has(s.staffId) && (s.revoked = true))
    }
    audit(ctx.db, ctx, `tenant.${action}`, t.name, sanitize(reason, 200), action === 'reinstate' ? 'warning' : 'critical', t.id)
    return t
  })
}

export function updateTenantTerms(token: string, id: string, input: { plan: Tenant['plan']; commissionPercent: number }): Promise<Tenant> {
  return run(token, (raw) => {
    const ctx = platform(raw)
    requirePermission(ctx, 'tenants.moderate')
    const t = ctx.db.tenants.find((x) => x.id === id)
    if (!t) throw new ApiError(404, 'Supermarket not found.')
    if (!(input.commissionPercent >= 0 && input.commissionPercent <= 20)) throw new ApiError(422, 'Commission must be 0–20%.')
    const before = `${t.plan} · ${t.commissionPercent}%`
    Object.assign(t, input)
    audit(ctx.db, ctx, 'tenant.terms', t.name, `${before} → ${t.plan} · ${t.commissionPercent}%`, 'warning', t.id)
    return t
  })
}

// ================================================================== supermarket admins

export function listChainAdmins(token: string): Promise<StaffView[]> {
  return run(token, (raw) => {
    const ctx = platform(raw)
    requirePermission(ctx, 'tenants.view')
    return ctx.db.staff.filter((s) => s.roleId === ROLE_IDS.chainAdmin).map((s) => toStaffView(ctx.db, s))
  })
}

export function addChainAdmin(token: string, tenantId: string, input: { name: string; email: string; phone: string }): Promise<{ admin: StaffView; tempPassword: string }> {
  return run(token, (raw) => {
    const ctx = platform(raw)
    requirePermission(ctx, 'tenant_admins.manage')
    requireStepUp(ctx)
    const t = ctx.db.tenants.find((x) => x.id === tenantId)
    if (!t || !['active', 'restricted'].includes(t.status)) throw new ApiError(409, 'Admins can only be added to active or restricted supermarkets.')
    const r = createChainAdminAccount(ctx, t, input)
    audit(ctx.db, ctx, 'tenant_admin.create', r.staff.name, `Chain admin for ${t.name}`, 'warning', t.id)
    return { admin: r.staff, tempPassword: r.tempPassword }
  })
}

function chainAdmin(ctx: AdminContext, id: string) {
  const s = ctx.db.staff.find((x) => x.id === id && x.roleId === ROLE_IDS.chainAdmin)
  if (!s) throw new ApiError(404, 'Supermarket admin not found.')
  return s
}

export function setChainAdminStatus(token: string, id: string, status: 'active' | 'suspended', reason: string): Promise<StaffView> {
  return run(token, (raw) => {
    const ctx = platform(raw)
    requirePermission(ctx, 'tenant_admins.manage')
    requireStepUp(ctx)
    const s = chainAdmin(ctx, id)
    if (status === 'suspended' && !sanitize(reason)) throw new ApiError(422, 'Give a reason.')
    s.status = status
    if (status === 'suspended') ctx.db.sessions.forEach((x) => x.staffId === s.id && (x.revoked = true))
    audit(ctx.db, ctx, status === 'suspended' ? 'tenant_admin.suspend' : 'tenant_admin.reactivate', s.name, sanitize(reason, 160), 'warning', s.tenantId)
    return toStaffView(ctx.db, s)
  })
}

export function resetChainAdminPassword(token: string, id: string): Promise<{ tempPassword: string }> {
  return run(token, (raw) => {
    const ctx = platform(raw)
    requirePermission(ctx, 'tenant_admins.manage')
    requireStepUp(ctx)
    const s = chainAdmin(ctx, id)
    const tempPassword = generateTempPassword()
    Object.assign(s, { passwordHash: hashPassword(s.email, tempPassword), mustChangePassword: true, passwordChangedAt: nowIso() })
    ctx.db.sessions.forEach((x) => x.staffId === s.id && (x.revoked = true))
    audit(ctx.db, ctx, 'tenant_admin.password_reset', s.name, 'Temporary password issued by HelaMart', 'warning', s.tenantId)
    return { tempPassword }
  })
}

// ================================================================== customers (all of Sri Lanka)

export function listAllCustomers(token: string): Promise<(Customer & { tenantNames: string[] })[]> {
  return run(token, (raw) => {
    const ctx = platform(raw)
    requirePermission(ctx, 'customers.all.view')
    const names = new Map(ctx.db.tenants.map((t) => [t.id, t.name]))
    return ctx.db.customers.map((c) => ({ ...c, tenantNames: c.tenantIds.map((id) => names.get(id) ?? id) })).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  })
}

export function setCustomerAccountStatus(token: string, id: string, status: Customer['status'], reason: string): Promise<Customer> {
  return run(token, (raw) => {
    const ctx = platform(raw)
    requirePermission(ctx, 'customers.all.manage')
    requireStepUp(ctx)
    const c = ctx.db.customers.find((x) => x.id === id)
    if (!c) throw new ApiError(404, 'Customer not found.')
    if (status === 'blocked' && !sanitize(reason)) throw new ApiError(422, 'Give a reason.')
    c.status = status
    audit(ctx.db, ctx, status === 'blocked' ? 'customer.suspend' : 'customer.reinstate', c.name, sanitize(reason, 160), 'warning', null)
    return c
  })
}

// ================================================================== platform settings

export function getPlatformSettings(token: string): Promise<PlatformSettings> {
  return run(token, (raw) => {
    const ctx = platform(raw)
    requirePermission(ctx, 'platform.settings.manage')
    return ctx.db.settings
  })
}

export function updatePlatformSettings(token: string, next: PlatformSettings): Promise<PlatformSettings> {
  return run(token, (raw) => {
    const ctx = platform(raw)
    requirePermission(ctx, 'platform.settings.manage')
    requireStepUp(ctx)
    const s = next.security
    const bad = (cond: boolean, msg: string) => {
      if (cond) throw new ApiError(422, msg)
    }
    bad(s.sessionIdleMinutes < 5 || s.sessionIdleMinutes > 60, 'Idle timeout must be 5–60 minutes.')
    bad(s.sessionMaxHours < 1 || s.sessionMaxHours > 24, 'Maximum session length must be 1–24 hours.')
    bad(s.maxLoginAttempts < 3 || s.maxLoginAttempts > 10, 'Allowed failed sign-ins must be 3–10.')
    bad(s.lockoutMinutes < 1 || s.lockoutMinutes > 120, 'Lockout must be 1–120 minutes.')
    bad(s.passwordMinLength < 10 || s.passwordMinLength > 64, 'Minimum password length must be 10–64.')
    bad(s.passwordExpiryDays < 0 || s.passwordExpiryDays > 365, 'Password expiry must be 0–365 days.')
    bad(!s.require2fa && !isSuperAdmin(ctx), 'Only a Super Admin can turn off two-factor sign-in.')
    bad(next.defaultCommissionPercent < 0 || next.defaultCommissionPercent > 20, 'Default commission must be 0–20%.')
    const before = ctx.db.settings.security
    const changed = (Object.keys(s) as (keyof typeof s)[]).filter((k) => before[k] !== s[k])
    ctx.db.settings = { ...next, platformName: sanitize(next.platformName, 40), supportEmail: sanitize(next.supportEmail, 80), supportHotline: sanitize(next.supportHotline, 30) }
    audit(ctx.db, ctx, 'platform.settings', 'Platform settings', changed.length ? `Security policy changed: ${changed.join(', ')}` : 'Platform details updated', changed.length ? 'critical' : 'info', null)
    return ctx.db.settings
  })
}

/**
 * Super Admin: open a supermarket's portal with full chain-admin access
 * (promotions, products, branches, staff…). Password confirmation required;
 * logged in both the HelaMart and the supermarket audit logs.
 */
export function startManagingTenant(token: string, tenantId: string): Promise<void> {
  return run(token, (raw) => {
    const ctx = platform(raw)
    if (!isSuperAdmin(ctx)) throw new ApiError(403, 'Only a HelaMart Super Admin can manage a supermarket directly.', 'FORBIDDEN')
    requireStepUp(ctx)
    const t = ctx.db.tenants.find((x) => x.id === tenantId)
    if (!t) throw new ApiError(404, 'Supermarket not found.')
    if (t.status !== 'active' && t.status !== 'restricted') throw new ApiError(409, `${t.name} is ${t.status} — approve it before managing its portal.`)
    ctx.session.actingTenantId = t.id
    audit(ctx.db, ctx, 'platform.manage_start', t.name, 'Super Admin started managing this supermarket', 'warning', null)
    audit(ctx.db, ctx, 'platform.manage_start', t.name, `${ctx.staff.name} (HelaMart Super Admin) started managing this supermarket`, 'warning', t.id)
  })
}

/** Leave "manage supermarket" mode and return to HelaMart control. */
export function stopManagingTenant(token: string): Promise<void> {
  return run(token, (ctx) => {
    if (!ctx.acting || !ctx.tenant) return
    audit(ctx.db, ctx, 'platform.manage_stop', ctx.tenant.name, 'Super Admin stopped managing this supermarket', 'info', ctx.tenant.id)
    audit(ctx.db, ctx, 'platform.manage_stop', ctx.tenant.name, 'Super Admin stopped managing this supermarket', 'info', null)
    ctx.session.actingTenantId = undefined
  })
}

export async function resetSampleData(token: string) {
  await latency(300, 500)
  const ctx = authenticate(token)
  if (!isSuperAdmin(ctx)) throw new ApiError(403, 'Only a Super Admin can reset sample data.', 'FORBIDDEN')
  requireStepUp(ctx)
  resetAdminDb()
}
