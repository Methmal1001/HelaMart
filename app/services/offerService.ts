import type { Offer } from '~/types'
import { api } from './http'

/**
 * GET /me/offers?storeId=&branchId= — promotions the signed-in customer can use at the chosen
 * supermarket and branch (offers for everyone, for this customer, or for first-time shoppers there).
 */
export function listMyOffers(accessToken: string, store?: { storeId: string; branchId: string } | null): Promise<Offer[]> {
  return api<Offer[]>('/me/offers', { token: accessToken, query: { storeId: store?.storeId, branchId: store?.branchId } })
}

/** GET /stores/:id/offers?branch= — public; personalised when a token is sent. */
export function listStoreOffers(storeId: string, branchId: string, accessToken?: string | null): Promise<Offer[]> {
  return api<Offer[]>(`/stores/${encodeURIComponent(storeId)}/offers`, { token: accessToken, query: { branch: branchId } })
}

/** Personal + supermarket offers, without duplicates (same id or code). */
export function mergeOffers(...lists: Offer[][]): Offer[] {
  const out: Offer[] = []
  for (const o of lists.flat()) if (!out.some((x) => x.id === o.id || x.code === o.code)) out.push(o)
  return out
}
