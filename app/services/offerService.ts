import type { Offer } from '~/types'
import { api } from './http'
import type { OfferDto } from './apiTypes'

/**
 * GET /me/offers?storeId=&branchId= — promotions the signed-in customer can use at the chosen
 * supermarket and branch (offers for everyone, for this customer, or for first-time shoppers there).
 */
export async function listMyOffers(accessToken: string, store?: { storeId: string; branchId: string } | null): Promise<Offer[]> {
  return (await api<OfferDto[]>('/me/offers', { token: accessToken, query: { storeId: store?.storeId, branchId: store?.branchId } })).map(fromOfferDto)
}

/** GET /stores/:id/offers?branch= — the branch's running and "coming soon" offers; personalised when a token is sent. */
export async function listStoreOffers(storeId: string, branchId: string, accessToken?: string | null): Promise<Offer[]> {
  return (await api<OfferDto[]>(`/stores/${encodeURIComponent(storeId)}/offers`, { query: { branch: branchId }, token: accessToken })).map(fromOfferDto)
}

/** The API's offer → the app's (a store theme needs its primary colour; the accent falls back to it). */
export function fromOfferDto(o: OfferDto): Offer {
  const { storeTheme, ...rest } = o
  return { ...rest, storeTheme: storeTheme?.primaryColor ? { logo: storeTheme.logo, primaryColor: storeTheme.primaryColor, accentColor: storeTheme.accentColor || storeTheme.primaryColor } : undefined }
}

/** Personal + supermarket offers, without duplicates (same id or code). */
export function mergeOffers(...lists: Offer[][]): Offer[] {
  const out: Offer[] = []
  for (const o of lists.flat()) if (!out.some((x) => x.id === o.id || x.code === o.code)) out.push(o)
  return out
}
