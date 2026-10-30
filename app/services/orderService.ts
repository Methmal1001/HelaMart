import type { CardDetails, CartLine, DeliveryDetails, Order, PaymentMethod, User } from '~/types'
import { getProduct } from '~/data/products'
import { priceCart } from '~/utils/pricing'
import { ApiError } from './apiError'
import { mergeOffers, offersForUser, storeOffersFor } from './offerService'
import { latency, readDb, verifyAccessToken, writeDb } from './mock/server'
import { readAdminDb, writeAdminDb } from './admin/db'
import { findPlace } from '~/data/places'
import { coversLocation } from '~/lib/coverage'
import { api, backendEnabled } from './http'

export interface PlaceOrderRequest {
  /** Verified supermarket + branch the shopper is buying from. */
  storeId: string
  branchId: string
  lines: CartLine[]
  delivery: DeliveryDetails
  payment: { method: PaymentMethod; card?: CardDetails }
}

function luhn(num: string) {
  let sum = 0
  let dbl = false
  for (let i = num.length - 1; i >= 0; i--) {
    let d = Number(num[i])
    if (dbl && (d *= 2) > 9) d -= 9
    sum += d
    dbl = !dbl
  }
  return sum % 10 === 0
}

/**
 * POST /orders — the server re-prices the cart with the customer's own offers
 * (never trusting client totals), "charges" the card and stores the order.
 * Test cards: 4242 4242 4242 4242 succeeds · 4000 0000 0000 0002 is declined.
 */
export async function placeOrder(accessToken: string, req: PlaceOrderRequest, user: User): Promise<Order> {
  if (backendEnabled()) return api<Order>('/orders', { method: 'POST', body: req, token: accessToken })
  await latency(700, 1200)
  const userId = verifyAccessToken(accessToken)
  if (!req.lines.length) throw new ApiError(400, 'Your cart is empty.')

  // The supermarket must be active (not pending/restricted/banned) and the branch open.
  const platform = readAdminDb()
  const store = platform.tenants.find((t) => t.id === req.storeId)
  const branch = platform.branches.find((b) => b.id === req.branchId && b.tenantId === req.storeId)
  if (!store || store.status !== 'active') throw new ApiError(409, 'This supermarket isn’t taking orders on HelaMart right now. Please choose another store.', 'STORE_UNAVAILABLE')
  if (!branch || branch.status !== 'open') throw new ApiError(409, `${branch?.name ?? 'This'} branch is closed at the moment. Please choose another branch.`, 'BRANCH_CLOSED')
  // Home delivery only inside the branch's own delivery area (set by the supermarket).
  if (req.delivery.method === 'delivery') {
    const town = findPlace(req.delivery.city)
    const target = { lat: town?.lat ?? Number.NaN, lng: town?.lng ?? Number.NaN, label: req.delivery.city }
    if (!coversLocation(branch.coverage, target)) throw new ApiError(422, `${store.name} ${branch.name} doesn’t deliver to ${req.delivery.city || 'that address'}. Choose a place in its delivery area, or store pickup.`, 'OUTSIDE_DELIVERY_AREA')
  }
  const customer = platform.customers.find((c) => c.id === userId)
  if (customer?.status === 'blocked') throw new ApiError(403, 'Your HelaMart account is suspended. Contact HelaMart support.', 'ACCOUNT_SUSPENDED')
  if (customer?.blockedByTenants.includes(store.id)) throw new ApiError(403, `${store.name} has blocked orders from this account. Contact the store for help.`, 'BLOCKED_BY_STORE')

  // Re-price on the server with the shopper's own offers + this branch's running supermarket offers.
  const offers = mergeOffers(offersForUser(userId), storeOffersFor(store.id, branch.id, userId))
  const breakdown = priceCart(req.lines, offers, { fulfilment: req.delivery.method })

  let cardLast4: string | undefined
  if (req.payment.method === 'card') {
    const number = (req.payment.card?.number ?? '').replace(/\s+/g, '')
    if (!/^\d{13,19}$/.test(number) || !luhn(number)) throw new ApiError(422, 'The card number is not valid.', 'CARD_INVALID')
    if (number === '4000000000000002') throw new ApiError(402, 'Your card was declined. Try another card or pay on delivery.', 'CARD_DECLINED')
    cardLast4 = number.slice(-4)
  }

  const db = readDb()
  const seq = db.orders.length + 1
  const now = new Date()
  const order: Order = {
    id: `ord_${now.getTime().toString(36)}`,
    number: `HM-${now.getFullYear()}-${String(10000 + seq).slice(1)}${String(now.getTime()).slice(-3)}`,
    createdAt: now.toISOString(),
    userId,
    storeId: store.id,
    branchId: branch.id,
    customerName: user.name,
    customerEmail: user.email,
    lines: breakdown.lines.map((l) => {
      const p = getProduct(l.productId)!
      return { ...l, name: p.name, size: p.size }
    }),
    breakdown,
    delivery: req.delivery,
    payment: { method: req.payment.method, cardLast4, status: req.payment.method === 'card' ? 'paid' : 'pay-on-delivery' },
    status: 'confirmed',
  }
  db.orders.push(order)
  writeDb(db)
  // Count usage of the supermarket's offers (shown on its Promotions page).
  const usedIds = new Set(breakdown.applied.map((a) => a.offer.id))
  if (usedIds.size) {
    const adminDb = readAdminDb()
    for (const o of adminDb.offers) if (o.tenantId === store.id && usedIds.has(o.id)) o.usageCount++
    writeAdminDb(adminDb)
  }
  return order
}
