import type { Category, Product } from '~/types'
import type { AdminCategory } from '~/types/admin'
import { STANDARD_CATEGORIES } from '~/data/categories'
import { api } from './http'

/** An admin category as the shop sees it. */
export function toCategory(c: AdminCategory): Category {
  // Keep HelaMart's short label for an unrenamed standard category; otherwise the supermarket's own name.
  const std = STANDARD_CATEGORIES.find((x) => x.id === c.id)
  const shortName = std && std.name === c.name ? std.shortName : c.name
  return { id: c.id, name: c.name, shortName, description: c.description, color: c.color, icon: c.icon, area: c.area, standard: c.standard }
}

/** GET /stores/:id/categories — the supermarket's visible categories, in its chosen order. */
export function getStoreCategories(storeId: string): Promise<Category[]> {
  return api<Category[]>(`/stores/${encodeURIComponent(storeId)}/categories`)
}

/**
 * GET /stores/:id/catalog?branch= — what a shopper sees at one branch:
 * the supermarket's own active products (in visible categories), its prices,
 * its uploaded photos and that branch's stock.
 */
export function getStoreCatalog(storeId: string, branchId: string): Promise<Product[]> {
  return api<Product[]>(`/stores/${encodeURIComponent(storeId)}/catalog`, { query: { branch: branchId } })
}
