import type { CardDetails, CartLine, DeliveryDetails, Order, PaymentMethod, User } from '~/types'
import { api } from './http'

export interface PlaceOrderRequest {
  /** Verified supermarket + branch the shopper is buying from. */
  storeId: string
  branchId: string
  lines: CartLine[]
  delivery: DeliveryDetails
  payment: { method: PaymentMethod; card?: CardDetails }
}

/**
 * POST /orders — the server re-prices the cart from its own prices and the customer's offers
 * (client totals are never trusted), "charges" the card, takes the items out of the branch's
 * stock and stores the order for that branch.
 * Test cards: 4242 4242 4242 4242 succeeds · 4000 0000 0000 0002 is declined.
 */
export function placeOrder(accessToken: string, req: PlaceOrderRequest, _user: User): Promise<Order> {
  return api<Order>('/orders', { method: 'POST', body: req, token: accessToken })
}
