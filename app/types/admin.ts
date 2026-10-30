import type { CategoryId, DeliveryDetails, IconName, Offer, OrderLine, OrderProgress, PriceBreakdown, Product, StoreAreaId } from './index'

// ================================================================== permissions

/** Platform-level permissions (HelaMart head office). */
export type PlatformPermission =
  | 'platform.dashboard'
  | 'tenants.view'
  | 'tenants.review'
  | 'tenants.moderate'
  | 'tenant_admins.manage'
  | 'customers.all.view'
  | 'customers.all.manage'
  | 'platform.staff.manage'
  | 'platform.roles.manage'
  | 'platform.audit.view'
  | 'platform.settings.manage'
  | 'platform.banners.manage'

/** Supermarket-level permissions (inside one chain). */
export type TenantPermission =
  | 'dashboard.view'
  | 'reports.view'
  | 'branches.view'
  | 'branches.manage'
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

export type Permission = PlatformPermission | TenantPermission
export type Scope = 'platform' | 'tenant'

export interface Role {
  id: string
  name: string
  description: string
  permissions: Permission[]
  /** platform roles belong to HelaMart; tenant roles to supermarkets. */
  scope: Scope
  /** null = built-in template available to every supermarket (or a platform role). */
  tenantId: string | null
  /** Built-in roles cannot be edited or deleted. */
  system: boolean
  /** Seniority — staff can only manage roles/people strictly below their own level. */
  level: number
  /** Branch-level roles must be tied to specific branches. */
  branchScoped: boolean
  createdAt: string
  createdBy?: string
}

// ================================================================== supermarkets

export type TenantStatus = 'pending' | 'active' | 'restricted' | 'banned' | 'rejected'

export interface TenantDocument {
  kind: 'br_certificate' | 'owner_nic' | 'address_proof'
  fileName: string
  sizeKb: number
  verified: boolean
}

/** A supermarket chain (one customer of the HelaMart platform). */
export interface Tenant {
  id: string
  /** Reference shown to applicants, e.g. HMA-2026-0042. */
  reference: string
  name: string
  legalName: string
  brNumber: string
  vatNumber?: string
  ownerName: string
  ownerNic: string
  email: string
  phone: string
  hqAddress: string
  district: string
  brandColor: string
  plan: 'standard' | 'premium'
  commissionPercent: number
  status: TenantStatus
  statusReason?: string
  statusChangedAt: string
  statusChangedBy?: string
  documents: TenantDocument[]
  /** From the application: planned first branch. */
  firstBranch: { name: string; city: string; district: string }
  expectedBranches: number
  createdAt: string
  approvedAt?: string
  // Chain-wide store settings (managed by the chain).
  hotline: string
  supportEmail: string
  defaultHours: string
  deliveryFeeCents: number
  minOrderCents: number
  /** Branding shoppers see inside the store — only ever set by a HelaMart-approved request. */
  branding?: BrandingProfile
}

/**
 * How a supermarket looks inside the HelaMart 3D store. HelaMart's own
 * look (app chrome, logo, colours) never changes; this only themes the
 * supermarket's space: racks, checkout area, banners and signs.
 */
export interface BrandingProfile {
  // ---- Standard plan
  /** `media:<id>` logo (transparent PNG/WebP works best). */
  logo?: string
  /** `media:<id>` main in-store banner (shown 3:1). */
  banner?: string
  primaryColor: string
  slogan: string
  // ---- Premium plan
  accentColor?: string
  /** Up to 3 extra promotional wall banners. */
  promoBanners: string[]
  /** Greeting shown to shoppers as they walk in. */
  welcomeMessage?: string
  /** Logo plates on every aisle end-cap. */
  logoOnFixtures: boolean
}

export type BrandingRequestStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn'

export interface BrandingRequest {
  id: string
  tenantId: string
  profile: BrandingProfile
  /** Human-readable list of what changes compared with the live branding. */
  changes: string[]
  status: BrandingRequestStatus
  submittedById: string
  submittedBy: string
  submittedAt: string
  reviewedBy?: string
  reviewedAt?: string
  reviewNote?: string
}

/** A branch's delivery area: drawn on a map plus the named cities / villages it serves. */
export interface DeliveryCoverage {
  /** Polygon corners as [lat, lng]. */
  polygon: [number, number][]
  /** Cities and villages inside the area (matched against the shopper's town). */
  places: string[]
  areaKm2: number
  updatedAt: string
  updatedBy: string
}

export type BranchStatus = 'open' | 'temporarily_closed' | 'closed'

export interface Branch {
  id: string
  tenantId: string
  name: string
  code: string
  district: string
  city: string
  address: string
  phone: string
  openingHours: string
  status: BranchStatus
  deliveryRadiusKm: number
  managerId?: string
  /** Map pin (resolved from the town when the branch is saved). */
  lat?: number
  lng?: number
  /**
   * Home-delivery area, set by the supermarket on a map. Shoppers outside it
   * can't choose this branch, and branches without one aren't shown at all.
   */
  coverage?: DeliveryCoverage
  createdAt: string
}

// ================================================================== people

export type StaffStatus = 'active' | 'suspended'

export interface StaffUser {
  id: string
  name: string
  email: string
  phone?: string
  title: string
  /** null = HelaMart platform staff. */
  tenantId: string | null
  /** Branches this person works at. Empty = every branch (chain-level). */
  branchIds: string[]
  roleId: string
  extraPermissions: Permission[]
  status: StaffStatus
  mfaSecret: string
  passwordHash: string
  passwordChangedAt: string
  mustChangePassword: boolean
  createdAt: string
  createdBy?: string
  lastLoginAt?: string
  avatarColor: string
}

/** Safe view of a staff member (never includes secrets). */
export type StaffView = Omit<StaffUser, 'mfaSecret' | 'passwordHash'> & {
  /** Set while a HelaMart Super Admin is managing a supermarket's portal. */
  acting?: { tenantId: string; tenantName: string; homeRoleName: string }
  roleName: string
  roleLevel: number
  effectivePermissions: Permission[]
  activeSessions: number
  tenantName: string | null
  tenantStatus: TenantStatus | null
  tenantStatusReason?: string
  branchNames: string[]
}

export interface Customer {
  id: string
  name: string
  email: string
  phone?: string
  provider: 'password' | 'google'
  /** Platform-wide account status (set by HelaMart). */
  status: 'active' | 'blocked'
  createdAt: string
  district: string
  city: string
  /** Supermarket chains this customer is registered with / shops at. */
  tenantIds: string[]
  /** Chains that have blocked this customer from their stores. */
  blockedByTenants: string[]
  ordersCount: number
  totalSpentCents: number
  lastOrderAt?: string
}

// ================================================================== commerce

export type OrderStatus = OrderProgress

export interface OrderEvent {
  at: string
  status: OrderStatus
  by: string
  note?: string
}

export interface AdminOrder {
  id: string
  number: string
  tenantId: string
  branchId: string
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
  source: 'storefront' | 'sample'
}

export interface AdminProduct extends Omit<Product, 'stock'> {
  tenantId: string
  /** Stock held at each branch. */
  stock: Record<string, number>
  reorderLevel: number
  status: 'active' | 'hidden'
  updatedAt: string
}

export interface AdminCategory {
  id: CategoryId
  tenantId: string
  name: string
  description: string
  color: string
  visible: boolean
  icon: IconName
  /** Store area it's shelved in (3D aisle / section). */
  area: StoreAreaId
  /** Display order in the shop (aisle list, filters). */
  order: number
  /** One of HelaMart's standard categories. */
  standard: boolean
}

/** HelaMart homepage promotion banner — managed by HelaMart head office only. */
export interface PlatformBanner {
  id: string
  title: string
  subtitle: string
  /** `media:<id>` 3:1 image; without it a themed design is drawn. */
  image?: string
  theme: 'green' | 'gold' | 'sunset' | 'ocean' | 'berry'
  /** Supermarket being promoted (optional) and one of its offers (optional). */
  tenantId?: string
  offerId?: string
  cta: 'shop' | 'offers' | 'none'
  /** Who sees it: everyone, shoppers in chosen districts, or only where the featured supermarket delivers. */
  target: 'all' | 'districts' | 'deliverable'
  districts: string[]
  startsAt: string
  endsAt: string
  /** Higher shows first. */
  priority: number
  status: 'active' | 'paused'
  views: number
  clicks: number
  createdAt: string
  createdBy: string
}

export interface AdminOffer extends Offer {
  tenantId: string
  /** Show it to shoppers as "Coming soon" up to 14 days before it starts. */
  announce?: boolean
  /** Branches the offer runs at. Empty = all branches. */
  branchIds: string[]
  status: 'active' | 'paused'
  audience: 'all' | 'new' | 'selected'
  customerIds: string[]
  usageCount: number
  createdAt: string
}

export type TaskStatus = 'todo' | 'in_progress' | 'done'
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'

export interface StaffTask {
  id: string
  /** null = HelaMart platform task. */
  tenantId: string | null
  branchId?: string
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
  /** null = platform-level event. */
  tenantId: string | null
  actorId: string | null
  actorName: string
  action: string
  target: string
  details?: string
  severity: AuditSeverity
}

/** HelaMart-wide policy (Super Admin). */
export interface PlatformSettings {
  platformName: string
  supportEmail: string
  supportHotline: string
  applicationsOpen: boolean
  defaultCommissionPercent: number
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

export interface TenantDashboard {
  revenueTodayCents: number
  revenue30dCents: number
  orders30d: number
  avgOrderCents: number
  pendingOrders: number
  customers: number
  newCustomers30d: number
  branchesOpen: number
  branchesTotal: number
  lowStock: { id: string; name: string; branch: string; stock: number }[]
  revenueByDay: { date: string; cents: number; orders: number }[]
  ordersByStatus: { status: OrderStatus; count: number }[]
  byBranch: { id: string; name: string; orders: number; cents: number }[]
  topProducts: { id: string; name: string; units: number }[]
  recentOrders: Pick<AdminOrder, 'id' | 'number' | 'createdAt' | 'customerName' | 'status' | 'breakdown' | 'branchId'>[]
}

export interface PlatformDashboard {
  tenantsByStatus: { status: TenantStatus; count: number }[]
  pendingApplications: { id: string; name: string; reference: string; district: string; createdAt: string }[]
  branches: number
  customers: number
  newCustomers30d: number
  gmv30dCents: number
  commission30dCents: number
  orders30d: number
  gmvByDay: { date: string; cents: number; orders: number }[]
  topTenants: { id: string; name: string; status: TenantStatus; branches: number; orders: number; cents: number }[]
  customersByProvince: { province: string; count: number }[]
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
