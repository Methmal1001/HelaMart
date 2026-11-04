import type { Branch, Customer, PlatformDashboard, PlatformSettings, StaffView, Tenant } from '~/types/admin'
import { apiGet as get, apiSend as send, encodeId as id } from './common'

/**
 * HelaMart head-office API (HelaMart backend, /admin/platform/*) — only platform staff can call these.
 * Supermarkets are reviewed, moderated and supported from here.
 */

export interface TenantSummary extends Tenant {
  branchCount: number
  adminCount: number
  orders30d: number
  gmv30dCents: number
  customers: number
}

// ================================================================== dashboard

export function getPlatformDashboard(token: string): Promise<PlatformDashboard> {
  return get(token, '/admin/platform/dashboard')
}

// ================================================================== supermarkets

export function listTenants(token: string): Promise<TenantSummary[]> {
  return get(token, '/admin/platform/tenants')
}

export interface TenantDetail {
  tenant: TenantSummary
  branches: (Branch & { managerName: string | null })[]
  admins: StaffView[]
  staffCount: number
}

export function getTenant(token: string, tenantId: string): Promise<TenantDetail> {
  return get(token, `/admin/platform/tenants/${id(tenantId)}`)
}

export function verifyDocument(token: string, tenantId: string, kind: Tenant['documents'][number]['kind'], verified: boolean): Promise<Tenant> {
  return send(token, 'PUT', `/admin/platform/tenants/${id(tenantId)}/documents/${id(kind)}`, { verified })
}

/** Approve a pending application: activates the supermarket, opens its first branch and creates the chain admin. */
export function approveTenant(token: string, tenantId: string, input: { commissionPercent: number; plan: Tenant['plan'] }): Promise<{ tenant: Tenant; admin: StaffView; tempPassword: string }> {
  return send(token, 'POST', `/admin/platform/tenants/${id(tenantId)}/approve`, input)
}

export function rejectTenant(token: string, tenantId: string, reason: string): Promise<Tenant> {
  return send(token, 'POST', `/admin/platform/tenants/${id(tenantId)}/reject`, { reason })
}

/** Restrict (read-only, hidden from shoppers), ban (blocked entirely) or reinstate a supermarket. */
export function moderateTenant(token: string, tenantId: string, action: 'restrict' | 'ban' | 'reinstate', reason: string): Promise<Tenant> {
  return send(token, 'POST', `/admin/platform/tenants/${id(tenantId)}/moderate`, { action, reason })
}

export function updateTenantTerms(token: string, tenantId: string, input: { plan: Tenant['plan']; commissionPercent: number }): Promise<Tenant> {
  return send(token, 'PUT', `/admin/platform/tenants/${id(tenantId)}/terms`, input)
}

// ================================================================== supermarket admins

export function listChainAdmins(token: string): Promise<StaffView[]> {
  return get(token, '/admin/platform/chain-admins')
}

export function addChainAdmin(token: string, tenantId: string, input: { name: string; email: string; phone: string }): Promise<{ admin: StaffView; tempPassword: string }> {
  return send(token, 'POST', `/admin/platform/tenants/${id(tenantId)}/admins`, input)
}

export function setChainAdminStatus(token: string, staffId: string, status: 'active' | 'suspended', reason: string): Promise<StaffView> {
  return send(token, 'PUT', `/admin/platform/chain-admins/${id(staffId)}/status`, { status, reason })
}

export function resetChainAdminPassword(token: string, staffId: string): Promise<{ tempPassword: string }> {
  return send(token, 'POST', `/admin/platform/chain-admins/${id(staffId)}/reset-password`)
}

// ================================================================== customers (all of Sri Lanka)

export function listAllCustomers(token: string): Promise<(Customer & { tenantNames: string[] })[]> {
  return get(token, '/admin/platform/customers')
}

export function setCustomerAccountStatus(token: string, customerId: string, status: Customer['status'], reason: string): Promise<Customer> {
  return send(token, 'PUT', `/admin/platform/customers/${id(customerId)}/status`, { status, reason })
}

// ================================================================== platform settings

export function getPlatformSettings(token: string): Promise<PlatformSettings> {
  return get(token, '/admin/platform/settings')
}

export function updatePlatformSettings(token: string, next: PlatformSettings): Promise<PlatformSettings> {
  return send(token, 'PUT', '/admin/platform/settings', next)
}

/**
 * Super Admin: open a supermarket's portal with full chain-admin access
 * (promotions, products, branches, staff…). Password confirmation required;
 * logged in both the HelaMart and the supermarket audit logs.
 */
export async function startManagingTenant(token: string, tenantId: string): Promise<void> {
  await send(token, 'POST', `/admin/platform/manage/${id(tenantId)}`)
}

/** Leave "manage supermarket" mode and return to HelaMart control. */
export async function stopManagingTenant(token: string): Promise<void> {
  await send(token, 'DELETE', '/admin/platform/manage')
}

/** Sample data now lives in the database; the API explains how to re-create it. */
export async function resetSampleData(token: string) {
  await send(token, 'POST', '/admin/platform/reset-sample-data')
}
