import type {
  AdminCategory,
  AdminOffer,
  AdminOrder,
  AdminProduct,
  AuditEntry,
  Customer,
  Role,
  StaffTask,
  StaffUser,
  StoreSettings,
} from '~/types/admin'
import { buildSeed } from '~/data/admin/seed'
import { hash, hashPassword, readDb as readStoreDb } from '../mock/server'

/**
 * MOCK ADMIN DATABASE (browser localStorage). Stands in for the real
 * back-office database; every read/write goes through the admin API layer.
 */
const KEY = 'helamart:admin-db:v1'

export interface AdminSessionRecord {
  id: string
  staffId: string
  refreshHash: string
  createdAt: number
  lastSeenAt: number
  /** Absolute end of the session regardless of activity. */
  expiresAt: number
  /** Re-authenticated (password confirmed) until this time — required for sensitive actions. */
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
  /** Set when the password must be changed before a session is issued. */
  passwordChange?: boolean
  verified?: boolean
}

export interface AdminDb {
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
  settings: StoreSettings
  loginAttempts: Record<string, { count: number; until: number }>
  /** Storefront order ids already imported. */
  importedOrderIds: string[]
}

let cache: AdminDb | null = null

function seed(): AdminDb {
  const s = buildSeed({ hashPassword, now: Date.now() })
  return { ...s, sessions: [], challenges: [], loginAttempts: {}, importedOrderIds: [] }
}

/** Bring in customers who registered and orders placed through the live storefront. */
function syncStorefront(db: AdminDb) {
  const store = readStoreDb()
  for (const u of store.extraUsers) {
    if (!db.customers.some((c) => c.id === u.id || c.email === u.email)) {
      db.customers.push({
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        provider: u.provider,
        status: 'active',
        createdAt: new Date().toISOString(),
        city: '—',
        ordersCount: 0,
        totalSpentCents: 0,
      })
    }
  }
  for (const o of store.orders) {
    if (db.importedOrderIds.includes(o.id)) continue
    db.importedOrderIds.push(o.id)
    db.orders.unshift({
      id: o.id,
      number: o.number,
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
  // Keep customer order stats derived from orders.
  for (const c of db.customers) {
    const mine = db.orders.filter((o) => o.customerId === c.id && o.status !== 'cancelled')
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
    db = cache ?? seed() // storage blocked: fall back to memory
  }
  syncStorefront(db)
  cache = db
  return db
}

export function writeAdminDb(db: AdminDb) {
  const now = Date.now()
  db.sessions = db.sessions.filter((s) => s.expiresAt > now && (!s.revoked || now - s.lastSeenAt < 864e5))
  db.challenges = db.challenges.filter((c) => c.expiresAt > now)
  db.audit = db.audit.slice(-2000)
  cache = db
  try {
    localStorage.setItem(KEY, JSON.stringify(db))
  } catch {
    /* storage unavailable */
  }
}

/** Testing helper: wipe the admin sample data back to its seeded state. */
export function resetAdminDb() {
  cache = seed()
  writeAdminDb(cache)
}

export { hash }
