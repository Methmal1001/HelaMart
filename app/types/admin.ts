import type { CategoryId, DeliveryDetails, Offer, OrderLine, PriceBreakdown, Product } from './index'

/** Every action an admin user can be allowed to perform. */
export type Permission =
  | 'dashboard.view'
  | 'reports.view'
  | 'orders.view'
  | 'orders.manage'
  | 'orders.refund'
  | 'products.view'
  | 'products.manage'
  | 'inventory.manage'
  | 'categories.manage'
  | 'customers.view'
  | 'customers.manage'
  | 'promotions.view'
  | 'promotions.manage'
  | 'tasks.view'
  | 'tasks.manage'
  | 'staff.view'
  | 'staff.manage'
  | 'roles.manage'
  | 'audit.view'
  | 'settings.manage'

export interface Role {
  id: string
  name: string
  description: string
  permissions: Permission[]
  /** Built-in roles (Super Admin, Admin) cannot be edited or deleted. */
  system: boolean
  /** Seniority — staff can only manage people in strictly lower levels. Super Admin = 100. */
  level: number
  createdAt: string
  createdBy?: string
}

export type StaffStatus = 'active' | 'suspended'

export interface StaffUser {
  id: string
  name: string
  email: string
  phone?: string
  title: string
  roleId: string
  /** Individual grants on top of the role. */
  extraPermissions: Permission[]
  status: StaffStatus
  /** Mock TOTP secret for two-factor sign-in. */
  mfaSecret: string
  passwordHash: string
  passwordChangedAt: string
  /** Set for new accounts / password resets: must choose a new password at next sign-in. */
  mustChangePassword: boolean
  createdAt: string
  createdBy?: string
  lastLoginAt?: string
  avatarColor: string
}

/** Safe view of a staff member (never includes secrets). */
export type StaffView = Omit<StaffUser, 'mfaSecret' | 'passwordHash'> & {
  roleName: string
  effectivePermissions: Permission[]
  activeSessions: number
}

export type OrderStatus = 'pending' | 'packing' | 'out_for_delivery' | 'ready_for_pickup' | 'delivered' | 'cancelled' | 'refunded'

export interface OrderEvent {
  at: string
  status: OrderStatus
  by: string
  note?: string
}

export interface AdminOrder {
  id: string
  number: string
  createdAt: string
  customerId: string
  customerName: string
  customerEmail: string
  lines: OrderLine[]
  breakdown: PriceBreakdown
  delivery: DeliveryDetails
  payment: { method: 'cod' | 'card'; cardLast4?: string; status: 'paid' | 'pay-on-delivery' | 'refunded' }
  status: OrderStatus
  history: OrderEvent[]
  /** Placed through the live storefront (vs. seeded sample data). */
  source: 'storefront' | 'sample'
}

export interface AdminProduct extends Product {
  stock: number
  reorderLevel: number
  status: 'active' | 'hidden'
  updatedAt: string
}

export interface AdminCategory {
  id: CategoryId
  name: string
  description: string
  color: string
  visible: boolean
}

export interface Customer {
  id: string
  name: string
  email: string
  phone?: string
  provider: 'password' | 'google'
  status: 'active' | 'blocked'
  createdAt: string
  city: string
  ordersCount: number
  totalSpentCents: number
  lastOrderAt?: string
}

export interface AdminOffer extends Offer {
  status: 'active' | 'paused'
  /** Who receives it. */
  audience: 'all' | 'new' | 'selected'
  customerIds: string[]
  usageCount: number
  createdAt: string
}

export type TaskStatus = 'todo' | 'in_progress' | 'done'
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'

export interface StaffTask {
  id: string
  title: string
  description: string
  assigneeId: string
  createdById: string
  priority: TaskPriority
  status: TaskStatus
  dueDate: string
  createdAt: string
  updatedAt: string
  comments: { at: string; byId: string; text: string }[]
}

export type AuditSeverity = 'info' | 'warning' | 'critical'

export interface AuditEntry {
  id: string
  at: string
  actorId: string | null
  actorName: string
  action: string
  target: string
  details?: string
  severity: AuditSeverity
}

export interface StoreSettings {
  storeName: string
  hotline: string
  supportEmail: string
  openingHours: string
  deliveryFeeCents: number
  orderCutoffTime: string
  maintenanceMode: boolean
  security: {
    sessionIdleMinutes: number
    sessionMaxHours: number
    maxLoginAttempts: number
    lockoutMinutes: number
    passwordMinLength: number
    passwordExpiryDays: number
    require2fa: boolean
  }
}

export interface AdminTokens {
  accessToken: string
  refreshToken: string
  accessExpiresAt: number
  refreshExpiresAt: number
}

export interface AdminSessionInfo {
  id: string
  createdAt: string
  lastSeenAt: string
  expiresAt: string
  userAgent: string
  current: boolean
}

export interface DashboardStats {
  revenueTodayCents: number
  revenue30dCents: number
  orders30d: number
  avgOrderCents: number
  pendingOrders: number
  customers: number
  newCustomers30d: number
  lowStock: { id: string; name: string; stock: number; reorderLevel: number }[]
  revenueByDay: { date: string; cents: number; orders: number }[]
  ordersByStatus: { status: OrderStatus; count: number }[]
  topProducts: { id: string; name: string; units: number; cents: number }[]
  recentOrders: Pick<AdminOrder, 'id' | 'number' | 'createdAt' | 'customerName' | 'status' | 'breakdown'>[]
}

export interface TableColumn {
  key: string
  label: string
  sortable?: boolean
  align?: 'left' | 'right' | 'center'
  class?: string
  /** Value used for sorting/searching when the cell is rendered by a slot. */
  value?: (row: any) => string | number
}
