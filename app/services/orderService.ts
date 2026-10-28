import type { CardDetails, CartLine, DeliveryDetails, Order, PaymentMethod, User } from '~/types'
import { getProduct } from '~/data/products'
import { priceCart } from '~/utils/pricing'
import { ApiError } from './apiError'
import { offersForUser } from './offerService'
import { latency, readDb, verifyAccessToken, writeDb } from './mock/server'

export interface PlaceOrderRequest {
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
  await latency(700, 1200)
  const userId = verifyAccessToken(accessToken)
  if (!req.lines.length) throw new ApiError(400, 'Your cart is empty.')

  const offers = offersForUser(userId)
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
  return order
}
