import type { Offer } from '~/types'
<<<<<<< HEAD
import type { AdminOffer } from '~/types/admin'
import { mockAccounts } from '~/data/mockUsers'
import { isOfferActive } from '~/utils/pricing'
import { latency, readDb, verifyAccessToken } from './mock/server'
import { readAdminDb } from './admin/db'
import { accentFor, liveBranding } from '~/lib/branding'

/** Announced offers appear as "Coming soon" this long before they start. */
const ANNOUNCE_MS = 14 * 864e5

/** Every newly created customer (registration or first Google sign-in) gets this. */
const NEW_CUSTOMER_OFFER: Offer = {
  id: 'off_newcustomer',
  code: 'HELLOHELA',
  title: 'New customer: Rs. 250 off',
  description: 'Rs. 250 off your order of Rs. 1,500 or more.',
  rule: { kind: 'fixed-off', amountCents: 25000, minSpendCents: 150000 },
  expiresAt: '2027-12-31T23:59:59+05:30',
}

/** Server-side lookup of a customer's personal offers (also used when pricing orders). */
export function offersForUser(userId: string): Offer[] {
  const seeded = mockAccounts.find((a) => a.user.id === userId)
  return structuredClone(seeded ? seeded.offers : [NEW_CUSTOMER_OFFER])
}

/** GET /me/offers — personal promotions for the signed-in customer. */
export async function listMyOffers(accessToken: string): Promise<Offer[]> {
  await latency(150, 350)
  return offersForUser(verifyAccessToken(accessToken))
=======
import { api } from './http'

/**
 * GET /me/offers?storeId=&branchId= — promotions the signed-in customer can use at the chosen
 * supermarket and branch (offers for everyone, for this customer, or for first-time shoppers there).
 */
export function listMyOffers(accessToken: string, store?: { storeId: string; branchId: string } | null): Promise<Offer[]> {
  return api<Offer[]>('/me/offers', { token: accessToken, query: { storeId: store?.storeId, branchId: store?.branchId } })
>>>>>>> 8e46a242e2aecf7d41f2156e1dff89087a4c12c2
}

/** How many of this customer's orders used the offer. */
function timesUsed(userId: string, offerId: string) {
  return readDb().orders.filter((o) => o.userId === userId && o.breakdown.applied.some((a) => a.offer.id === offerId)).length
}

/**
 * The supermarket's running offers for one branch and shopper (server-side).
 * Branch-wise offers only show at their branches; "new customer" offers only
 * for shoppers who haven't ordered from this supermarket; "selected" ones
 * only for the chosen customers; per-customer limits are enforced.
 * Guests see offers for everyone (and new-customer offers, re-checked at checkout).
 */
export function storeOffersFor(storeId: string, branchId: string, userId: string | null, now = Date.now()): Offer[] {
  const db = readAdminDb()
  const store = db.tenants.find((t) => t.id === storeId)
  if (!store || store.status !== 'active') return []
  const brand = liveBranding(store)
  const storeTheme = { logo: brand.logo, primaryColor: brand.primaryColor, accentColor: accentFor(brand) }
  const orderedHere = userId ? db.orders.some((o) => o.customerId === userId && o.tenantId === storeId && o.status !== 'cancelled') || readDb().orders.some((o) => o.userId === userId && o.storeId === storeId) : false
  return db.offers
    .filter((o: AdminOffer) => {
      if (o.tenantId !== storeId || o.status !== 'active' || Date.parse(o.expiresAt) <= now) return false
      // Scheduled offers stay hidden until they start, unless the supermarket announces them in advance.
      const startsAt = o.conditions?.startsAt ? Date.parse(o.conditions.startsAt) : 0
      if (startsAt > now && !(o.announce && startsAt - now <= ANNOUNCE_MS)) return false
      if (o.branchIds.length && !o.branchIds.includes(branchId)) return false
      if (o.audience === 'selected' && !(userId && o.customerIds.includes(userId))) return false
      if (o.audience === 'new' && orderedHere) return false
      const limit = o.conditions?.perCustomerLimit
      if (limit && userId && timesUsed(userId, o.id) >= limit) return false
      return true
    })
    .map((o) => ({ id: o.id, code: o.code, title: o.title, description: o.description, rule: o.rule, expiresAt: o.expiresAt, conditions: o.conditions, storeId, storeName: store.name, forNewCustomers: o.audience === 'new' || undefined, storeTheme, upcoming: !isOfferActive(o, now) || undefined }))
}

/** GET /stores/:id/offers?branch= — public; personalised when a token is sent. */
export async function listStoreOffers(storeId: string, branchId: string, accessToken?: string | null): Promise<Offer[]> {
  await latency(80, 200)
  let userId: string | null = null
  try {
    userId = accessToken ? verifyAccessToken(accessToken) : null
  } catch {
    userId = null
  }
  return storeOffersFor(storeId, branchId, userId)
}

/** Personal + supermarket offers, without duplicates (same id or code). */
export function mergeOffers(...lists: Offer[][]): Offer[] {
  const out: Offer[] = []
  for (const o of lists.flat()) if (!out.some((x) => x.id === o.id || x.code === o.code)) out.push(o)
  return out
}
