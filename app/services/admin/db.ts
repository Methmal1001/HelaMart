import type {
  AdminCategory,
  AdminOffer,
  AdminOrder,
  AdminProduct,
  AuditEntry,
  Branch,
  BrandingRequest,
  Customer,
  OrderWorkflow,
  PlatformBanner,
  PlatformSettings,
  Role,
  StaffTask,
  StaffUser,
  Tenant,
} from '~/types/admin'
import { LFM_DESK_OFFICERS, SAMPLE_STORE_OFFERS, buildSeed, sampleBanners } from '~/data/admin/seed'
import { attachStages, defaultWorkflow, snapshotStages } from '~/lib/workflow'
import { PLATFORM_PERMISSIONS, ROLE_IDS, TENANT_PERMISSIONS } from '~/data/admin/permissions'
import { STANDARD_CATEGORIES } from '~/data/categories'
import { hash, hashPassword, randomId, readDb as readStoreDb } from '../mock/server'

/**
 * MOCK PLATFORM DATABASE (browser localStorage). Every record that belongs
 * to a supermarket carries `tenantId` (and `branchId` where relevant); the API
 * layer filters on these so one chain can never see another chain's data.
 */
const KEY = 'helamart:platform-db:v2'

export interface AdminSessionRecord {
  id: string
  staffId: string
  refreshHash: string
  createdAt: number
  lastSeenAt: number
  expiresAt: number
  stepUpUntil: number
  revoked: boolean
  replacedBy?: string
  familyId: string
  userAgent: string
  /** HelaMart Super Admin managing a supermarket's portal ("act as chain admin"). */
  actingTenantId?: string
}

export interface MfaChallenge {
  id: string
  staffId: string
  expiresAt: number
  attempts: number
  passwordChange?: boolean
  verified?: boolean
}

/** Uploaded product photo (blob lives in the media store, metadata here). */
export interface MediaRecord {
  id: string
  tenantId: string
  uploadedBy: string
  bytes: number
  type: string
  width: number
  height: number
  createdAt: string
  /** What the image is for (logos/banners can only be used as such). */
  purpose?: 'product' | 'logo' | 'banner'
}

export interface AdminDb {
  media: MediaRecord[]
  brandingRequests: BrandingRequest[]
  /** HelaMart homepage promotion banners (head office). */
  banners: PlatformBanner[]
  tenants: Tenant[]
  branches: Branch[]
  roles: Role[]
  staff: StaffUser[]
  sessions: AdminSessionRecord[]
  challenges: MfaChallenge[]
  orders: AdminOrder[]
  /** Each supermarket's order sections (Cashier → Packing → Verification → Delivery…). */
  workflows: OrderWorkflow[]
  products: AdminProduct[]
  categories: AdminCategory[]
  customers: Customer[]
  offers: AdminOffer[]
  tasks: StaffTask[]
  audit: AuditEntry[]
  settings: PlatformSettings
  loginAttempts: Record<string, { count: number; until: number }>
  /** Public application submissions per browser (rate limiting). */
  applicationLog: number[]
  importedOrderIds: string[]
  /** Sample-data version this browser's copy has been upgraded to. */
  dataVersion?: number
}

let cache: AdminDb | null = null

function seed(): AdminDb {
  const s = buildSeed({ hashPassword, now: Date.now() })
  return { ...s, media: [], sessions: [], challenges: [], loginAttempts: {}, applicationLog: [], importedOrderIds: [], dataVersion: DATA_VERSION }
}

/** Bump when the sample data gains something older browser copies should receive. */
const DATA_VERSION = 8

/**
 * One-time upgrade of data saved by an older version of the prototype:
 * sample branches get their map pin + delivery area (branches without one are
 * hidden from shoppers), and newer sample supermarkets are added. Anything the
 * user created or changed (their own supermarkets, branches, drawn areas) is kept.
 */
function upgradeSampleData(db: AdminDb) {
  const fresh = seed()
  for (const b of db.branches) {
    const sample = fresh.branches.find((x) => x.id === b.id)
    if (!sample) continue
    if (b.lat === undefined) Object.assign(b, { lat: sample.lat, lng: sample.lng })
    if (!b.coverage) b.coverage = sample.coverage
  }
  for (const t of fresh.tenants) {
    const existing = db.tenants.find((x) => x.id === t.id)
    if (existing) {
      if (!existing.branding && t.branding) existing.branding = t.branding
      continue
    }
    db.tenants.push(t)
    db.branches.push(...fresh.branches.filter((b) => b.tenantId === t.id))
    db.categories.push(...fresh.categories.filter((c) => c.tenantId === t.id))
    db.products.push(...fresh.products.filter((p) => p.tenantId === t.id))
    db.staff.push(...fresh.staff.filter((x) => x.tenantId === t.id && !db.staff.some((y) => y.email === x.email)))
  }
  // v4: supermarket offers for shoppers, HelaMart homepage banners, banner permission for Super Admin.
  db.banners ??= []
  if (!db.banners.length) db.banners = sampleBanners(Date.now())
  for (const o of SAMPLE_STORE_OFFERS) {
    if (!db.offers.some((x) => x.id === o.id) && db.tenants.some((t) => t.id === o.tenantId)) db.offers.push({ ...o, usageCount: 0, createdAt: new Date().toISOString() })
  }
  const superRole = db.roles.find((r) => r.id === ROLE_IDS.superAdmin)
  if (superRole) superRole.permissions = [...new Set([...superRole.permissions, ...PLATFORM_PERMISSIONS])]
  // v5: categories carry an icon, store area and order (customisable per supermarket).
  const order = new Map<string, number>()
  for (const c of db.categories) {
    const std = STANDARD_CATEGORIES.find((s) => s.id === c.id)
    const n = order.get(c.tenantId) ?? 0
    order.set(c.tenantId, n + 1)
    Object.assign(c, { icon: c.icon ?? std?.icon ?? 'tag', area: c.area ?? std?.area ?? 'household', order: c.order ?? n, standard: c.standard ?? !!std })
  }
  // v6: order desk — every supermarket gets the standard sections; Lanka Fresh Mart's sample team works them.
  db.workflows ??= []
  for (const r of fresh.roles) if (!db.roles.some((x) => x.id === r.id)) db.roles.push(r)
  const cashier = db.roles.find((r) => r.id === 'role_lfm_cashier')
  if (cashier) cashier.permissions = cashier.permissions.filter((p) => p !== 'orders.manage')
  for (const x of fresh.staff) if (x.tenantId === 'tnt_lfm' && !db.staff.some((y) => y.id === x.id || y.email === x.email)) db.staff.push(x)
  for (const t of db.tenants) if (!db.workflows.some((w) => w.tenantId === t.id)) db.workflows.push(defaultWorkflow(t.id, t.id === 'tnt_lfm' ? LFM_DESK_OFFICERS : {}))
  for (const o of db.orders) attachStages(o, workflowFor(db, o.tenantId, o.branchId))
  // v7: order slips with a tracking QR; the delivery section finishes with "Customer received".
  const RENAME: Record<string, string> = { 'Mark delivered': 'Customer received', 'Handed over': 'Customer collected' }
  for (const w of db.workflows) {
    for (const s of w.stages) {
      if (s.id === 'stg_cashier' && s.printSlip === undefined) s.printSlip = true
      s.completeLabel = RENAME[s.completeLabel] ?? s.completeLabel
    }
  }
  for (const o of db.orders) {
    ensureTrackToken(o)
    for (const s of o.stages ?? []) {
      s.completeLabel = RENAME[s.completeLabel] ?? s.completeLabel
      if (s.stageId === 'stg_cashier' && s.printSlip === undefined) s.printSlip = true
    }
  }
  // v8: branch-wise management — the chain admin holds every supermarket permission (incl. the order workflow).
  const chainAdmin = db.roles.find((r) => r.id === ROLE_IDS.chainAdmin)
  if (chainAdmin) chainAdmin.permissions = [...TENANT_PERMISSIONS]
  db.dataVersion = DATA_VERSION
}

/** The secret in an order slip's QR code (anyone holding the slip can track it and confirm receipt). */
export function ensureTrackToken(o: AdminOrder) {
  o.trackToken ??= randomId(12)
  return o.trackToken
}

/** A supermarket's order workflow (created with the standard sections the first time it's needed). */
export function workflowFor(db: AdminDb, tenantId: string, branchId?: string): OrderWorkflow {
  db.workflows ??= []
  // A branch's own workflow, when it has one; otherwise the chain default.
  const own = branchId ? db.workflows.find((x) => x.tenantId === tenantId && x.branchId === branchId) : undefined
  if (own) return own
  let w = db.workflows.find((x) => x.tenantId === tenantId && !x.branchId)
  if (!w) {
    w = defaultWorkflow(tenantId)
    db.workflows.push(w)
  }
  return w
}

/** Bring in shoppers who registered and orders placed through the live storefront. */
function syncStorefront(db: AdminDb) {
  const store = readStoreDb()
  for (const o of store.orders) {
    if (db.importedOrderIds.includes(o.id)) continue
    db.importedOrderIds.push(o.id)
    const branch = db.branches.find((b) => b.id === o.branchId) ?? db.branches.find((b) => b.id === 'br_lfm_div')!
    db.orders.unshift({
      id: o.id,
      number: o.number,
      tenantId: branch.tenantId,
      branchId: branch.id,
      createdAt: o.createdAt,
      customerId: o.userId,
      customerName: o.customerName,
      customerEmail: o.customerEmail,
      lines: o.lines,
      breakdown: o.breakdown,
      delivery: o.delivery,
      payment: o.payment,
      status: 'pending',
      history: [{ at: o.createdAt, status: 'pending', by: 'Customer (storefront)' }],
      source: 'storefront',
      // Straight into the supermarket's first section (usually the cashier).
      stages: snapshotStages(workflowFor(db, branch.tenantId, branch.id), o.delivery.method),
      stageIndex: 0,
      trackToken: randomId(12),
    })
  }
  for (const u of store.extraUsers) {
    if (!db.customers.some((c) => c.id === u.id || c.email === u.email)) {
      db.customers.push({
        id: u.id, name: u.name, email: u.email, phone: u.phone, provider: u.provider, status: 'active',
        createdAt: new Date().toISOString(), district: '—', city: '—', tenantIds: [], blockedByTenants: [], ordersCount: 0, totalSpentCents: 0,
      })
    }
  }
  // Keep every customer's mobile number current (added or changed on the storefront).
  for (const c of db.customers) {
    const phone = store.preferences?.[c.id]?.phone ?? store.extraUsers.find((u) => u.id === c.id)?.phone
    if (phone && c.phone !== phone) c.phone = phone
    // New storefront customers: district/town from the shopping area they chose.
    const loc = store.preferences?.[c.id]?.location
    if (loc && (c.district === '—' || !c.district)) Object.assign(c, { district: loc.district, city: loc.label })
  }
  // Derived stats + chain membership from orders.
  for (const c of db.customers) {
    const mine = db.orders.filter((o) => o.customerId === c.id && o.status !== 'cancelled')
    for (const o of mine) if (!c.tenantIds.includes(o.tenantId)) c.tenantIds.push(o.tenantId)
    c.ordersCount = mine.length
    c.totalSpentCents = mine.filter((o) => o.status !== 'refunded').reduce((s, o) => s + o.breakdown.totalCents, 0)
    c.lastOrderAt = mine.map((o) => o.createdAt).sort().at(-1)
  }
}

/** Always read the latest copy so several admin tabs stay consistent. */
export function readAdminDb(): AdminDb {
  let db: AdminDb
  try {
    const raw = localStorage.getItem(KEY)
    db = raw ? (JSON.parse(raw) as AdminDb) : seed()
    if (!raw) localStorage.setItem(KEY, JSON.stringify(db))
  } catch {
    db = cache ?? seed()
  }
  db.media ??= []
  db.brandingRequests ??= []
  db.banners ??= []
  if ((db.dataVersion ?? 0) < DATA_VERSION) {
    upgradeSampleData(db)
    try {
      localStorage.setItem(KEY, JSON.stringify(db))
    } catch {
      /* storage unavailable */
    }
  }
  syncStorefront(db)
  cache = db
  return db
}

export function writeAdminDb(db: AdminDb) {
  const now = Date.now()
  db.sessions = db.sessions.filter((s) => s.expiresAt > now && (!s.revoked || now - s.lastSeenAt < 864e5))
  db.challenges = db.challenges.filter((c) => c.expiresAt > now)
  db.audit = db.audit.slice(-3000)
  db.applicationLog = db.applicationLog.filter((t) => now - t < 3600e3)
  cache = db
  try {
    localStorage.setItem(KEY, JSON.stringify(db))
  } catch {
    /* storage unavailable */
  }
}

export function resetAdminDb() {
  cache = seed()
  writeAdminDb(cache)
}

export { hash }
