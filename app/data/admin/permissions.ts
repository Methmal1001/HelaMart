import type { Permission } from '~/types/admin'

export interface PermissionGroup {
  id: string
  label: string
  permissions: { id: Permission; label: string; description: string; sensitive?: boolean }[]
}

/** Permission catalogue — drives the role editor, page guards and API checks. */
export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    id: 'overview',
    label: 'Overview',
    permissions: [
      { id: 'dashboard.view', label: 'View dashboard', description: 'Sales, orders and stock overview.' },
      { id: 'reports.view', label: 'View revenue figures', description: 'Revenue totals and trends on the dashboard.' },
    ],
  },
  {
    id: 'orders',
    label: 'Orders',
    permissions: [
      { id: 'orders.view', label: 'View orders', description: 'See orders and customer delivery details.' },
      { id: 'orders.manage', label: 'Update orders', description: 'Move orders through packing, delivery and cancellation.' },
      { id: 'orders.refund', label: 'Issue refunds', description: 'Refund paid orders.', sensitive: true },
    ],
  },
  {
    id: 'catalogue',
    label: 'Catalogue',
    permissions: [
      { id: 'products.view', label: 'View products', description: 'See products, prices and stock.' },
      { id: 'products.manage', label: 'Edit products & prices', description: 'Create, edit, hide products and change prices.' },
      { id: 'inventory.manage', label: 'Adjust stock', description: 'Receive stock and correct stock counts.' },
      { id: 'categories.manage', label: 'Manage categories', description: 'Rename, recolour and show/hide sections.' },
    ],
  },
  {
    id: 'customers',
    label: 'Customers & marketing',
    permissions: [
      { id: 'customers.view', label: 'View customers', description: 'See customer profiles and order history.' },
      { id: 'customers.manage', label: 'Block / unblock customers', description: 'Suspend customer accounts.', sensitive: true },
      { id: 'promotions.view', label: 'View promotions', description: 'See offers and their usage.' },
      { id: 'promotions.manage', label: 'Manage promotions', description: 'Create, pause and delete offers.' },
    ],
  },
  {
    id: 'team',
    label: 'Team',
    permissions: [
      { id: 'tasks.view', label: 'View tasks', description: 'See own tasks (and all tasks with “Manage tasks”).' },
      { id: 'tasks.manage', label: 'Assign & manage tasks', description: 'Create tasks for others and see everyone’s tasks.' },
      { id: 'staff.view', label: 'View staff', description: 'See the staff directory.' },
      { id: 'staff.manage', label: 'Manage staff accounts', description: 'Add staff, change roles, suspend, reset passwords.', sensitive: true },
      { id: 'roles.manage', label: 'Manage roles & permissions', description: 'Create roles and grant permissions.', sensitive: true },
    ],
  },
  {
    id: 'system',
    label: 'System & security',
    permissions: [
      { id: 'audit.view', label: 'View audit log', description: 'See every admin action and sign-in.' },
      { id: 'settings.manage', label: 'Store & security settings', description: 'Delivery fee, hours, session and password policy.', sensitive: true },
    ],
  },
]

export const ALL_PERMISSIONS: Permission[] = PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.id))

export function permissionLabel(id: Permission) {
  for (const g of PERMISSION_GROUPS) {
    const p = g.permissions.find((x) => x.id === id)
    if (p) return p.label
  }
  return id
}

export const ROLE_IDS = { superAdmin: 'role_super_admin', admin: 'role_admin' } as const
