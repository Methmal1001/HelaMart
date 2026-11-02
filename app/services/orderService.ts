import type { CardDetails, CartLine, DeliveryDetails, Order, PaymentMethod, PublicTracking, User } from '~/types'
import type { AdminOrder } from '~/types/admin'
import { ApiError } from './apiError'
import { api } from './http'
import { latency, readDb, verifyAccessToken, writeDb } from './mock/server'
import { readAdminDb, writeAdminDb } from './admin/db'
import { markReceived } from './admin/handover'
import { atHandover, stageLabel, trackingSteps } from '~/lib/workflow'

export interface PlaceOrderRequest {
  /** Verified supermarket + branch the shopper is buying from. */
  storeId: string
  branchId: string
  lines: CartLine[]
  delivery: DeliveryDetails
  payment: { method: PaymentMethod; card?: CardDetails }
}

// The functions below are in-browser until the HelaMart API serves them; the access token's
// account id (the same in the API and the sample data) says whose orders they are.

/**
 * GET /me/orders — the signed-in customer's orders, newest first, with the
 * supermarket's latest progress (packing, out for delivery…) so a bill can be
 * reopened and reprinted any time.
 */
export async function listMyOrders(accessToken: string): Promise<Order[]> {
  await latency(150, 350)
  const userId = verifyAccessToken(accessToken)
  const platform = readAdminDb()
  return readDb()
    .orders.filter((o) => o.userId === userId)
    .map((o) => {
      const desk = platform.orders.find((x) => x.id === o.id)
      const branch = platform.branches.find((b) => b.id === o.branchId)
      const storeName = o.storeName ?? platform.tenants.find((t) => t.id === o.storeId)?.name
      // The supermarket's own sections (Cashier → Packing → …), as the customer sees them.
      const steps = desk?.stages ? trackingSteps(desk, storeName) : undefined
      const cur = desk?.stages?.[desk.stageIndex ?? 0]
      return {
        ...o,
        steps,
        stageLabel: desk ? stageLabel(desk) : undefined,
        trackKey: desk ? `${desk.status}:${desk.stageIndex ?? 0}:${cur?.state ?? ''}:${steps?.reduce((n, s) => n + (s.notes?.length ?? 0), 0) ?? 0}` : undefined,
        received: desk?.received ? { at: desk.received.at, via: desk.received.via, receivedBy: desk.received.receivedBy } : undefined,
        canConfirmReceipt: !!desk && atHandover(desk),
        storeName,
        branchName: o.branchName ?? branch?.name,
        progress: desk?.status ?? 'pending',
        // Staff names stay on the order desk; the customer sees what happened and when.
        tracking: desk?.history.map((h) => ({ at: h.at, status: h.status, note: h.status === 'cancelled' || h.status === 'refunded' ? h.note : undefined })) ?? [{ at: o.createdAt, status: 'pending' as const }],
        payment: desk?.payment.status === 'refunded' ? { ...o.payment, status: 'refunded' as const } : o.payment,
      }
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/**
 * POST /me/orders/:id/received — the signed-in customer confirms they have
 * their order (delivered to the door, or collected at the counter).
 */
export async function confirmMyOrderReceived(accessToken: string, orderId: string): Promise<void> {
  await latency(250, 500)
  const userId = verifyAccessToken(accessToken)
  const db = readAdminDb()
  const o = db.orders.find((x) => x.id === orderId && x.customerId === userId)
  if (!o) throw new ApiError(404, 'Order not found.')
  markReceived(db, o, { via: 'customer_app', receivedBy: o.customerName })
  writeAdminDb(db)
}

// ------------------------------------------------------------------ tracking QR (order slip)

function findByTrackCode(number: string, code: string) {
  const db = readAdminDb()
  const o = db.orders.find((x) => x.number === number.trim().toUpperCase())
  // Wrong code behaves exactly like an unknown order (no guessing order numbers).
  if (!o || !o.trackToken || !code || o.trackToken !== code) throw new ApiError(404, 'This tracking link isn’t valid. Scan the QR code on your order slip again.', 'TRACK_NOT_FOUND')
  return { db, o }
}

function publicView(db: ReturnType<typeof readAdminDb>, o: AdminOrder): PublicTracking {
  const store = db.tenants.find((t) => t.id === o.tenantId)
  const branch = db.branches.find((b) => b.id === o.branchId)
  return {
    number: o.number,
    createdAt: o.createdAt,
    storeName: store?.name ?? 'Supermarket',
    branchName: branch?.name ?? '',
    customerFirstName: o.customerName.split(/\s+/)[0] ?? '',
    delivery: { method: o.delivery.method, city: o.delivery.city },
    lines: o.lines.map((l) => ({ name: l.name, size: l.size, quantity: l.quantity })),
    itemCount: o.breakdown.itemCount,
    totalCents: o.breakdown.totalCents,
    progress: o.status,
    stageLabel: stageLabel(o),
    steps: o.stages ? trackingSteps(o, store?.name) : undefined,
    tracking: o.history.map((h) => ({ at: h.at, status: h.status, note: h.status === 'cancelled' || h.status === 'refunded' ? h.note : undefined })),
    received: o.received ? { at: o.received.at, via: o.received.via, receivedBy: o.received.receivedBy } : undefined,
    canConfirmReceipt: atHandover(o),
  }
}

/** GET /track/:number?t= — what the slip's QR code opens (no sign-in; the code proves you hold the slip). */
export async function trackOrder(number: string, code: string): Promise<PublicTracking> {
  await latency(200, 400)
  const { db, o } = findByTrackCode(number, code)
  return publicView(db, o)
}

/** POST /track/:number/received — the customer scanned the QR on arrival and confirms they have the order. */
export async function confirmReceivedByQr(number: string, code: string, receivedBy: string): Promise<PublicTracking> {
  await latency(300, 600)
  const { db, o } = findByTrackCode(number, code)
  markReceived(db, o, { via: 'customer_qr', receivedBy: receivedBy.trim().slice(0, 60) || o.customerName })
  writeAdminDb(db)
  return publicView(db, o)
}

/**
 * POST /orders — the server re-prices the cart from its own prices and the customer's offers
 * (client totals are never trusted), "charges" the card, takes the items out of the branch's
 * stock and stores the order for that branch.
 * Test cards: 4242 4242 4242 4242 succeeds · 4000 0000 0000 0002 is declined.
 */
export async function placeOrder(accessToken: string, req: PlaceOrderRequest, _user: User): Promise<Order> {
  const order = await api<Order>('/orders', { method: 'POST', body: req, token: accessToken })
  // The API doesn't serve order tracking yet: keep a copy so "Your orders", the slip QR
  // and the supermarket's Order desk (all in-browser for now) can follow this order.
  const db = readDb()
  if (!db.orders.some((o) => o.id === order.id)) db.orders.push(order)
  writeDb(db)
  return order
}
