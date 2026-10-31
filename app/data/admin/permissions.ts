import type { Permission, PlatformPermission, Scope, TenantPermission } from '~/types/admin'

export interface PermissionGroup<P extends Permission = Permission> {
  id: string
  label: string
  permissions: { id: P; label: string; description: string; sensitive?: boolean }[]
}

/** HelaMart head-office permissions. */
export const PLATFORM_PERMISSION_GROUPS: PermissionGroup<PlatformPermission>[] = [
  {
    id: 'p-overview',
    label: 'Platform overview',
    permissions: [{ id: 'platform.dashboard', label: 'View platform dashboard', description: 'Supermarkets, sales and customers across Sri Lanka.' }],
  },
  {
    id: 'p-tenants',
    label: 'Supermarkets',
    permissions: [
      { id: 'tenants.view', label: 'View supermarkets', description: 'See supermarkets, branches, documents and performance.' },
      { id: 'tenants.review', label: 'Review applications', description: 'Approve or reject new supermarket applications.', sensitive: true },
      { id: 'tenants.moderate', label: 'Restrict / ban supermarkets', description: 'Restrict, ban or reinstate supermarkets.', sensitive: true },
      { id: 'tenant_admins.manage', label: 'Manage supermarket admins', description: 'Create, suspend and reset chain admins.', sensitive: true },
    ],
  },
  {
    id: 'p-customers',
    label: 'Customers',
    permissions: [
      { id: 'customers.all.view', label: 'View all customers', description: 'Every registered shopper in Sri Lanka.' },
      { id: 'customers.all.manage', label: 'Suspend customer accounts', description: 'Block a shopper across the whole platform.', sensitive: true },
    ],
  },
  {
    id: 'p-system',
    label: 'HelaMart team & system',
    permissions: [
      { id: 'platform.staff.manage', label: 'Manage HelaMart staff', description: 'Add and manage head-office team members.', sensitive: true },
      { id: 'platform.roles.manage', label: 'Manage platform roles', description: 'Create head-office roles.', sensitive: true },
      { id: 'platform.audit.view', label: 'View platform audit log', description: 'Every action across all supermarkets.' },
      { id: 'platform.settings.manage', label: 'Platform & security settings', description: 'Security policy, commission, applications.', sensitive: true },
    ],
  },
  {
    id: 'p-marketing',
    label: 'HelaMart homepage',
    permissions: [
      { id: 'platform.banners.manage', label: 'Manage homepage banners', description: 'Create, target and schedule the promotion banners shoppers see on HelaMart.' },
    ],
  },
]

/** Permissions inside one supermarket chain. */
export const TENANT_PERMISSION_GROUPS: PermissionGroup<TenantPermission>[] = [
  {
    id: 'overview',
    label: 'Overview',
    permissions: [
      { id: 'dashboard.view', label: 'View dashboard', description: 'Sales, orders and stock overview.' },
      { id: 'reports.view', label: 'View revenue figures', description: 'Revenue totals and trends.' },
    ],
  },
  {
    id: 'branches',
    label: 'Branches',
    permissions: [
      { id: 'branches.view', label: 'View branches', description: 'See branch details and status.' },
      { id: 'branches.manage', label: 'Manage branches', description: 'Open, edit and close branches; appoint branch heads.', sensitive: true },
    ],
  },
  {
    id: 'orders',
    label: 'Orders',
    permissions: [
      { id: 'orders.view', label: 'View orders', description: 'See orders and delivery details.' },
      { id: 'orders.manage', label: 'Supervise orders', description: 'Act on every section of the order desk, reassign work and cancel orders. (Officers only need to be assigned to their section.)' },
      { id: 'orders.refund', label: 'Issue refunds', description: 'Refund paid orders.', sensitive: true },
      { id: 'workflow.manage', label: 'Customise the order workflow', description: 'Set up order sections and assign their officers — the chain default, or a branch’s own workflow for branch staff.' },
    ],
  },
  {
    id: 'catalogue',
    label: 'Catalogue',
    permissions: [
      { id: 'products.view', label: 'View products', description: 'See products, prices and stock.' },
      { id: 'products.manage', label: 'Edit products & prices', description: 'Create, edit and hide products; change prices.' },
      { id: 'inventory.manage', label: 'Adjust stock', description: 'Receive deliveries and correct stock counts.' },
      { id: 'categories.manage', label: 'Manage categories', description: 'Rename, recolour and show/hide sections.' },
    ],
  },
  {
    id: 'customers',
    label: 'Customers & marketing',
    permissions: [
      { id: 'customers.view', label: 'View customers', description: 'Chain customers across Sri Lanka.' },
      { id: 'customers.manage', label: 'Block customers from this chain', description: 'Stop a shopper ordering from your stores.', sensitive: true },
      { id: 'promotions.view', label: 'View promotions', description: 'See offers and their usage.' },
      { id: 'promotions.manage', label: 'Manage promotions', description: 'Create, pause and delete offers.' },
    ],
  },
  {
    id: 'team',
    label: 'Team',
    permissions: [
      { id: 'tasks.view', label: 'View tasks', description: 'See own tasks.' },
      { id: 'tasks.manage', label: 'Assign & manage tasks', description: 'Create tasks for others and see the team’s tasks.' },
      { id: 'staff.view', label: 'View staff', description: 'See the staff directory.' },
      { id: 'staff.manage', label: 'Manage officers', description: 'Add officers, change roles, suspend, reset passwords.', sensitive: true },
      { id: 'roles.manage', label: 'Manage roles', description: 'Create custom roles and grant permissions.', sensitive: true },
    ],
  },
  {
    id: 'system',
    label: 'Records & settings',
    permissions: [
      { id: 'audit.view', label: 'View audit log', description: 'Every action taken in your supermarket.' },
      { id: 'settings.manage', label: 'Chain settings', description: 'Store name, hotline, delivery fee and hours.', sensitive: true },
    ],
  },
]

export const PLATFORM_PERMISSIONS: PlatformPermission[] = PLATFORM_PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.id))
export const TENANT_PERMISSIONS: TenantPermission[] = TENANT_PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.id))
export const ALL_PERMISSIONS: Permission[] = [...PLATFORM_PERMISSIONS, ...TENANT_PERMISSIONS]

export function permissionsFor(scope: Scope): Permission[] {
  return scope === 'platform' ? PLATFORM_PERMISSIONS : TENANT_PERMISSIONS
}

export function groupsFor(scope: Scope): PermissionGroup[] {
  return (scope === 'platform' ? PLATFORM_PERMISSION_GROUPS : TENANT_PERMISSION_GROUPS) as PermissionGroup[]
}

export function permissionLabel(id: Permission) {
  for (const g of [...PLATFORM_PERMISSION_GROUPS, ...TENANT_PERMISSION_GROUPS] as PermissionGroup[]) {
    const p = g.permissions.find((x) => x.id === id)
    if (p) return p.label
  }
  return id
}

export const ROLE_IDS = {
  superAdmin: 'role_super_admin',
  chainAdmin: 'role_chain_admin',
  branchManager: 'role_branch_manager',
} as const

/** Permissions a Branch Manager role template holds. */
export const BRANCH_MANAGER_PERMISSIONS: TenantPermission[] = [
  'dashboard.view', 'reports.view', 'branches.view', 'orders.view', 'orders.manage', 'orders.refund', 'products.view',
  'inventory.manage', 'customers.view', 'promotions.view', 'tasks.view', 'tasks.manage', 'staff.view', 'staff.manage', 'audit.view',
]

/**
 * Chain-wide settings no branch can own: given only to chain-level staff (the
 * supermarket admin), never to people tied to branches.
 */
export const CHAIN_ONLY_PERMISSIONS: TenantPermission[] = ['settings.manage', 'roles.manage', 'categories.manage']

/** What a supermarket admin may hand to its branch managers (always limited to their own branches). */
export const DELEGABLE_PERMISSIONS: TenantPermission[] = TENANT_PERMISSIONS.filter((p) => !CHAIN_ONLY_PERMISSIONS.includes(p))
