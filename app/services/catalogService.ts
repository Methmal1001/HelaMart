import type { Product } from '~/types'
import { readAdminDb } from './admin/db'

/**
 * GET /stores/:id/catalog?branch= — what a shopper sees at one branch:
 * the supermarket's own active products (in visible categories), its prices,
 * its uploaded photos and that branch's stock.
 */
export function getStoreCatalog(storeId: string, branchId: string): Product[] {
  const db = readAdminDb()
  const hidden = new Set(db.categories.filter((c) => c.tenantId === storeId && !c.visible).map((c) => c.id))
  return db.products
    .filter((p) => p.tenantId === storeId && p.status === 'active' && !hidden.has(p.categoryId))
    .map(({ tenantId: _t, stock, reorderLevel: _r, status: _s, updatedAt: _u, ...product }) => ({ ...product, stock: stock[branchId] ?? 0 }))
}
