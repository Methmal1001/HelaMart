<<<<<<< HEAD
import type { Category, Product } from '~/types'
import type { AdminCategory } from '~/types/admin'
import { readAdminDb } from './admin/db'
import { STANDARD_CATEGORIES } from '~/data/categories'
=======
import type { Product } from '~/types'
import { api } from './http'
>>>>>>> 8e46a242e2aecf7d41f2156e1dff89087a4c12c2

/**
 * GET /stores/:id/catalog?branch= — what a shopper sees at one branch:
 * the supermarket's own active products (in visible categories), its prices,
 * its uploaded photos and that branch's stock.
 */
<<<<<<< HEAD
/** An admin category as the shop sees it. */
export function toCategory(c: AdminCategory): Category {
  // Keep HelaMart's short label for an unrenamed standard category; otherwise the supermarket's own name.
  const std = STANDARD_CATEGORIES.find((x) => x.id === c.id)
  const shortName = std && std.name === c.name ? std.shortName : c.name
  return { id: c.id, name: c.name, shortName, description: c.description, color: c.color, icon: c.icon, area: c.area, standard: c.standard }
}

/** GET /stores/:id/categories — the supermarket's visible categories, in its chosen order. */
export function getStoreCategories(storeId: string): Category[] {
  return readAdminDb()
    .categories.filter((c) => c.tenantId === storeId && c.visible)
    .sort((a, b) => a.order - b.order)
    .map(toCategory)
}

export function getStoreCatalog(storeId: string, branchId: string): Product[] {
  const db = readAdminDb()
  // Only products in categories that exist and are visible (removed or hidden categories take their products off the shelves).
  const shown = new Set(db.categories.filter((c) => c.tenantId === storeId && c.visible).map((c) => c.id))
  return db.products
    .filter((p) => p.tenantId === storeId && p.status === 'active' && shown.has(p.categoryId))
    .map(({ tenantId: _t, stock, reorderLevel: _r, status: _s, updatedAt: _u, ...product }) => ({ ...product, stock: stock[branchId] ?? 0 }))
=======
export function getStoreCatalog(storeId: string, branchId: string): Promise<Product[]> {
  return api<Product[]>(`/stores/${encodeURIComponent(storeId)}/catalog`, { query: { branch: branchId } })
>>>>>>> 8e46a242e2aecf7d41f2156e1dff89087a4c12c2
}
