import type { Product } from '~/types'
import { api } from './http'

/**
 * GET /stores/:id/catalog?branch= — what a shopper sees at one branch:
 * the supermarket's own active products (in visible categories), its prices,
 * its uploaded photos and that branch's stock.
 */
export function getStoreCatalog(storeId: string, branchId: string): Promise<Product[]> {
  return api<Product[]>(`/stores/${encodeURIComponent(storeId)}/catalog`, { query: { branch: branchId } })
}
