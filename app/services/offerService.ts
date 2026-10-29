import type { Offer } from '~/types'
import { api } from './http'

/**
 * GET /me/offers?storeId=&branchId= — promotions the signed-in customer can use at the chosen
 * supermarket and branch (offers for everyone, for this customer, or for first-time shoppers there).
 */
export function listMyOffers(accessToken: string, store?: { storeId: string; branchId: string } | null): Promise<Offer[]> {
  return api<Offer[]>('/me/offers', { token: accessToken, query: { storeId: store?.storeId, branchId: store?.branchId } })
}
