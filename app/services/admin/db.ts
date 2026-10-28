import type {
  AdminCategory,
  AdminOffer,
  AdminOrder,
  AdminProduct,
  AuditEntry,
  Branch,
  Customer,
  PlatformSettings,
  Role,
  StaffTask,
  StaffUser,
  Tenant,
} from '~/types/admin'
import { buildSeed } from '~/data/admin/seed'
import { hash, hashPassword, readDb as readStoreDb } from '../mock/server'

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
}

export interface MfaChallenge {
  id: string
  staffId: string
  expiresAt: number
  attempts: number
  passwordChange?: boolean
  verified?: boolean
}

export interface AdminDb {
  tenants: Tenant[]
  branches: Branch[]
  roles: Role[]
  staff: StaffUser[]
  sessions: AdminSessionRecord[]
  challenges: MfaChallenge[]
  orders: AdminOrder[]
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
}

let cache: AdminDb | null = null

function seed(): AdminDb {
  const s = buildSeed({ hashPassword, now: Date.now() })
  return { ...s, sessions: [], challenges: [], loginAttempts: {}, applicationLog: [], importedOrderIds: [] }
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
