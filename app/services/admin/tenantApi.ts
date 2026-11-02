import type { AdminCategory, AdminOffer, AdminOrder, AdminProduct, Branch, Customer, OrderStatus, Tenant, TenantDashboard } from '~/types/admin'
import type { CategoryId, IconName, OfferConditions, OfferRule, ProductShape } from '~/types'
import { STANDARD_CATEGORIES, STORE_AREAS } from '~/data/categories'
import { ApiError } from '../apiError'
import { latency, randomId } from '../mock/server'
import { putMedia } from '../mock/mediaStore'
import { sniffImageType } from '~/utils/imageProcessing'
import { locateBranch } from '~/data/places'
import { cleanPlaces, coverageProblems } from '~/lib/coverage'
import { maxReachKm, polygonAreaKm2 } from '~/lib/geo'
import { readAdminDb, writeAdminDb, type MediaRecord } from './db'
import {
  allowedBranches,
  allowedBranchIds,
  assertBranchAccess,
  audit,
  authenticate,
  isChainLevel,
  ownedOrNotFound,
  requirePermission,
  requireStepUp,
  requireTenant,
  requireWritable,
  sanitize,
  type AdminContext,
} from './security'
import { money, nowIso, run } from './common'

/**
 * Supermarket (tenant) API. Every query is filtered to the caller's chain and,
 * for branch-level staff, to their branches. Records from other supermarkets
 * are reported as "not found" (no information leaks across tenants).
 */

const inTenant = <T extends { tenantId: string | null }>(ctx: AdminContext, list: T[]) => list.filter((x) => x.tenantId === requireTenant(ctx).id)

// ================================================================== dashboard

export function getTenantDashboard(token: string, branchId: string | 'all' = 'all'): Promise<TenantDashboard> {
  return run(token, (ctx) => {
    requirePermission(ctx, 'dashboard.view')
    const allowed = allowedBranchIds(ctx)
    if (branchId !== 'all') assertBranchAccess(ctx, branchId)
    const scope = branchId === 'all' ? allowed : new Set([branchId])
    const showMoney = ctx.permissions.has('reports.view')
    const now = Date.now()
    const orders = inTenant(ctx, ctx.db.orders).filter((o) => scope.has(o.branchId))
    const valid = orders.filter((o) => o.status !== 'cancelled' && o.status !== 'refunded')
    const last30 = valid.filter((o) => now - Date.parse(o.createdAt) < 30 * 864e5)
    const r30 = last30.reduce((s, o) => s + o.breakdown.totalCents, 0)
    const branches = allowedBranches(ctx)
    const statusOrder: OrderStatus[] = ['pending', 'packing', 'out_for_delivery', 'ready_for_pickup', 'delivered', 'cancelled', 'refunded']
    const units = new Map<string, { name: string; units: number }>()
    for (const o of last30) for (const l of o.lines) {
      const u = units.get(l.productId) ?? { name: l.name, units: 0 }
      u.units += l.quantity
      units.set(l.productId, u)
    }
    const lowStock: TenantDashboard['lowStock'] = []
    for (const p of inTenant(ctx, ctx.db.products)) {
      if (p.status !== 'active') continue
      for (const b of branches) if (scope.has(b.id) && (p.stock[b.id] ?? 0) <= p.reorderLevel) lowStock.push({ id: p.id, name: p.name, branch: b.name, stock: p.stock[b.id] ?? 0 })
    }
    const customers = ctx.db.customers.filter((c) => c.tenantIds.includes(ctx.tenant!.id))
    return {
      revenueTodayCents: showMoney ? valid.filter((o) => new Date(o.createdAt).toDateString() === new Date().toDateString()).reduce((s, o) => s + o.breakdown.totalCents, 0) : 0,
      revenue30dCents: showMoney ? r30 : 0,
      orders30d: last30.length,
      avgOrderCents: showMoney && last30.length ? Math.round(r30 / last30.length) : 0,
      pendingOrders: orders.filter((o) => o.status === 'pending' || o.status === 'packing').length,
      customers: customers.length,
      newCustomers30d: customers.filter((c) => now - Date.parse(c.createdAt) < 30 * 864e5).length,
      branchesOpen: branches.filter((b) => b.status === 'open').length,
      branchesTotal: branches.length,
      lowStock: lowStock.sort((a, b) => a.stock - b.stock).slice(0, 8),
      revenueByDay: Array.from({ length: 14 }, (_, i) => {
        const d = new Date(now - (13 - i) * 864e5)
        const day = valid.filter((o) => new Date(o.createdAt).toDateString() === d.toDateString())
        return { date: d.toISOString().slice(0, 10), cents: showMoney ? day.reduce((s, o) => s + o.breakdown.totalCents, 0) : 0, orders: day.length }
      }),
      ordersByStatus: statusOrder.map((s) => ({ status: s, count: orders.filter((o) => o.status === s).length })),
      byBranch: branches.map((b) => {
        const bo = last30.filter((o) => o.branchId === b.id)
        return { id: b.id, name: b.name, orders: bo.length, cents: showMoney ? bo.reduce((s, o) => s + o.breakdown.totalCents, 0) : 0 }
      }),
      topProducts: [...units.entries()].map(([id, u]) => ({ id, ...u })).sort((a, b) => b.units - a.units).slice(0, 6),
      recentOrders: orders.slice(0, 6).map((o) => ({ id: o.id, number: o.number, createdAt: o.createdAt, customerName: o.customerName, status: o.status, breakdown: o.breakdown, branchId: o.branchId })),
    }
  })
}

// ================================================================== branches

export function listBranches(token: string): Promise<(Branch & { managerName: string | null; staffCount: number })[]> {
  return run(token, (ctx) => {
    requirePermission(ctx, 'branches.view')
    return allowedBranches(ctx).map((b) => ({
      ...b,
      managerName: ctx.db.staff.find((s) => s.id === b.managerId)?.name ?? null,
      staffCount: ctx.db.staff.filter((s) => s.tenantId === b.tenantId && s.branchIds.includes(b.id)).length,
    }))
  })
}

/** Branch names for pickers (any supermarket staff). */
export function branchDirectory(token: string): Promise<{ id: string; name: string; status: Branch['status'] }[]> {
  return run(token, (ctx) => allowedBranches(ctx).map((b) => ({ id: b.id, name: b.name, status: b.status })))
}

export interface BranchInput {
  name: string
  district: string
  city: string
  address: string
  phone: string
  openingHours: string
  deliveryRadiusKm: number
  managerId?: string
}

export function saveBranch(token: string, input: BranchInput, id?: string): Promise<Branch> {
  return run(token, (ctx) => {
    requirePermission(ctx, 'branches.manage')
    const t = requireWritable(ctx)
    if (!isChainLevel(ctx)) throw new ApiError(403, 'Only chain-level admins can open or edit branches.', 'FORBIDDEN')
    const name = sanitize(input.name, 60)
    if (name.length < 2) throw new ApiError(422, 'Enter the branch name.')
    if (!sanitize(input.address, 200)) throw new ApiError(422, 'Enter the branch address.')
    if (!(input.deliveryRadiusKm >= 0 && input.deliveryRadiusKm <= 50)) throw new ApiError(422, 'Delivery radius must be 0–50 km.')
    if (input.managerId) {
      const m = ctx.db.staff.find((s) => s.id === input.managerId && s.tenantId === t.id && s.status === 'active')
      if (!m) throw new ApiError(422, 'Choose an active staff member from your supermarket as branch head.')
    }
    const city = sanitize(input.city, 60)
    // Pin the branch on the map from its town (district centre when the town isn't known) so shoppers can find it by area.
    const pin = locateBranch({ city, district: input.district })
    const fields = { name, district: input.district, city, address: sanitize(input.address, 200), phone: sanitize(input.phone, 30), openingHours: sanitize(input.openingHours, 80), deliveryRadiusKm: input.deliveryRadiusKm, managerId: input.managerId || undefined, lat: pin.lat, lng: pin.lng }
    if (id) {
      const b = ownedOrNotFound(ctx, ctx.db.branches.find((x) => x.id === id), 'Branch')
      Object.assign(b, fields)
      audit(ctx.db, ctx, 'branch.update', b.name, `${b.city}, ${b.district}`)
      return b
    }
    const existing = ctx.db.branches.filter((b) => b.tenantId === t.id)
    // Follow the chain's existing code prefix (e.g. "LFM-"), else use the name's initials.
    const prefix = existing[0]?.code.split('-')[0] ?? t.name.split(/\s+/).map((w) => w[0]).join('').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase()
    const code = `${prefix}-${sanitize(name, 60).replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || String(existing.length + 1).padStart(3, '0')}`
    const b: Branch = { ...fields, id: `br_${randomId(5)}`, tenantId: t.id, code: existing.some((x) => x.code === code) ? `${code}${existing.length + 1}` : code, status: 'open', createdAt: nowIso() }
    ctx.db.branches.push(b)
    for (const p of inTenant(ctx, ctx.db.products)) p.stock[b.id] = 0
    audit(ctx.db, ctx, 'branch.create', b.name, `${b.city}, ${b.district}`, 'warning')
    return b
  })
}

/**
 * PUT /branches/:id/coverage — the branch's home-delivery area (map polygon +
 * named cities/villages). Required before shoppers can see the branch.
 */
export function saveBranchCoverage(token: string, branchId: string, input: { polygon: [number, number][]; places: string[] }): Promise<Branch> {
  return run(token, (ctx) => {
    requirePermission(ctx, 'branches.manage')
    requireWritable(ctx)
    const b = ownedOrNotFound(ctx, ctx.db.branches.find((x) => x.id === branchId), 'Branch')
    assertBranchAccess(ctx, b.id)
    const polygon = (Array.isArray(input.polygon) ? input.polygon : []).map((p) => [Math.round(Number(p?.[0]) * 1e5) / 1e5, Math.round(Number(p?.[1]) * 1e5) / 1e5] as [number, number])
    const places = cleanPlaces(Array.isArray(input.places) ? input.places : [])
    const pin = locateBranch(b)
    const problems = coverageProblems(polygon, places, pin)
    if (problems.length) throw new ApiError(422, problems[0]!)
    const areaKm2 = Math.round(polygonAreaKm2(polygon) * 10) / 10
    b.coverage = { polygon, places, areaKm2, updatedAt: nowIso(), updatedBy: ctx.staff.name }
    // Keep the legacy radius in step (used for display only).
    b.deliveryRadiusKm = Math.min(50, Math.round(maxReachKm(pin.lat, pin.lng, polygon)))
    audit(ctx.db, ctx, 'branch.coverage', b.name, `${areaKm2} km² · ${places.length} places: ${places.slice(0, 6).join(', ')}${places.length > 6 ? '…' : ''}`, 'warning')
    return b
  })
}

export function setBranchStatus(token: string, id: string, status: Branch['status'], reason: string): Promise<Branch> {
  return run(token, (ctx) => {
    requirePermission(ctx, 'branches.manage')
    requireWritable(ctx)
    const b = ownedOrNotFound(ctx, ctx.db.branches.find((x) => x.id === id), 'Branch')
    assertBranchAccess(ctx, b.id)
    if (status !== 'open' && !sanitize(reason)) throw new ApiError(422, 'Give a reason — shoppers will see the branch as closed.')
    b.status = status
    audit(ctx.db, ctx, 'branch.status', b.name, `${status.replace('_', ' ')}${reason ? ` · ${sanitize(reason, 120)}` : ''}`, 'warning')
    return b
  })
}

// ================================================================== orders

export function listOrders(token: string): Promise<AdminOrder[]> {
  return run(token, (ctx) => {
    requirePermission(ctx, 'orders.view')
    const allowed = allowedBranchIds(ctx)
    return inTenant(ctx, ctx.db.orders).filter((o) => allowed.has(o.branchId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  })
}

const NEXT: Record<OrderStatus, OrderStatus[]> = {
  pending: ['packing', 'cancelled'],
  packing: ['out_for_delivery', 'ready_for_pickup', 'cancelled'],
  out_for_delivery: ['delivered'],
  ready_for_pickup: ['delivered'],
  delivered: ['refunded'],
  cancelled: [],
  refunded: [],
}

export function allowedTransitions(order: AdminOrder): OrderStatus[] {
  return NEXT[order.status].filter((s) => (s === 'out_for_delivery' ? order.delivery.method === 'delivery' : s === 'ready_for_pickup' ? order.delivery.method === 'pickup' : true))
}

export function updateOrderStatus(token: string, orderId: string, status: OrderStatus, note = ''): Promise<AdminOrder> {
  return run(token, (ctx) => {
    requirePermission(ctx, status === 'refunded' ? 'orders.refund' : 'orders.manage')
    requireWritable(ctx)
    if (status === 'refunded') requireStepUp(ctx)
    const order = ownedOrNotFound(ctx, ctx.db.orders.find((o) => o.id === orderId), 'Order')
    assertBranchAccess(ctx, order.branchId)
    if (!allowedTransitions(order).includes(status)) throw new ApiError(409, `An order that is “${order.status.replace(/_/g, ' ')}” can’t move to “${status.replace(/_/g, ' ')}”.`)
    if (status === 'cancelled' || status === 'refunded') {
      if (!sanitize(note)) throw new ApiError(422, 'Please give a reason.')
      if (status === 'cancelled') for (const l of order.lines) {
        const p = ctx.db.products.find((x) => x.id === l.productId && x.tenantId === order.tenantId)
        if (p) p.stock[order.branchId] = (p.stock[order.branchId] ?? 0) + l.quantity
      }
      if (order.payment.status === 'paid') order.payment.status = 'refunded'
    }
    const prev = order.status
    order.status = status
    order.history.push({ at: nowIso(), status, by: ctx.staff.name, note: sanitize(note) || undefined })
    audit(ctx.db, ctx, `order.${status}`, order.number, `${prev} → ${status}${note ? ` · ${sanitize(note, 120)}` : ''}`, status === 'refunded' ? 'warning' : 'info')
    return order
  })
}

// ================================================================== products & stock

export function listProducts(token: string): Promise<AdminProduct[]> {
  return run(token, (ctx) => {
    requirePermission(ctx, 'products.view')
    const allowed = allowedBranchIds(ctx)
    // Branch staff only see their own branches' stock figures.
    return inTenant(ctx, ctx.db.products).map((p) => ({ ...p, stock: Object.fromEntries(Object.entries(p.stock).filter(([b]) => allowed.has(b))) }))
  })
}

export interface ProductInput {
  name: string
  brand: string
  categoryId: CategoryId
  size: string
  unit: string
  priceCents: number
  description: string
  shape: ProductShape
  color: string
  accent: string
  badge?: AdminProduct['badge']
  reorderLevel: number
  /** `media:<id>` from uploadProductImage, or null to remove the photo. */
  image?: string | null
}

function validateProduct(input: ProductInput, ctx?: AdminContext) {
  if (input.image) {
    // Only this supermarket's own uploads may be attached (no hot-linking other tenants' media).
    const id = /^media:([a-f0-9]{8,64})$/.exec(input.image)?.[1]
    const rec = id && ctx?.db.media.find((m) => m.id === id)
    if (!rec || rec.tenantId !== ctx?.tenant?.id) throw new ApiError(422, 'That photo isn’t available. Upload it again.')
  }
  if (sanitize(input.name, 80).length < 2) throw new ApiError(422, 'Enter a product name.')
  if (!Number.isInteger(input.priceCents) || input.priceCents <= 0 || input.priceCents > 100_000_000) throw new ApiError(422, 'Enter a valid price.')
  if (!/^#[0-9a-f]{6}$/i.test(input.color) || !/^#[0-9a-f]{6}$/i.test(input.accent)) throw new ApiError(422, 'Pick valid package colours.')
  if (!Number.isInteger(input.reorderLevel) || input.reorderLevel < 0) throw new ApiError(422, 'Reorder level must be 0 or more.')
  if (ctx && !ctx.db.categories.some((c) => c.tenantId === ctx.tenant?.id && c.id === input.categoryId)) throw new ApiError(422, 'Choose one of your categories.')
}

export function createProduct(token: string, input: ProductInput): Promise<AdminProduct> {
  return run(token, (ctx) => {
    requirePermission(ctx, 'products.manage')
    const t = requireWritable(ctx)
    validateProduct(input, ctx)
    const product: AdminProduct = {
      ...input,
      image: input.image || undefined,
      id: `${sanitize(input.name, 40).toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${randomId(2)}`,
      tenantId: t.id,
      name: sanitize(input.name, 80),
      brand: sanitize(input.brand, 60),
      description: sanitize(input.description, 300),
      stock: Object.fromEntries(ctx.db.branches.filter((b) => b.tenantId === t.id).map((b) => [b.id, 0])),
      status: 'active',
      updatedAt: nowIso(),
    }
    ctx.db.products.unshift(product)
    audit(ctx.db, ctx, 'product.create', product.name, money(product.priceCents))
    return product
  })
}

export function updateProduct(token: string, id: string, input: ProductInput): Promise<AdminProduct> {
  return run(token, (ctx) => {
    requirePermission(ctx, 'products.manage')
    requireWritable(ctx)
    validateProduct(input, ctx)
    const p = ownedOrNotFound(ctx, ctx.db.products.find((x) => x.id === id && x.tenantId === ctx.tenant?.id), 'Product')
    const changes: string[] = []
    if (p.priceCents !== input.priceCents) changes.push(`price ${money(p.priceCents)} → ${money(input.priceCents)}`)
    if ((p.image ?? null) !== (input.image ?? null)) changes.push(input.image ? 'new product photo' : 'photo removed')
    Object.assign(p, { ...input, image: input.image || undefined, name: sanitize(input.name, 80), brand: sanitize(input.brand, 60), description: sanitize(input.description, 300), updatedAt: nowIso() })
    audit(ctx.db, ctx, 'product.update', p.name, changes.join('; ') || 'Details updated')
    return p
  })
}

export function setProductStatus(token: string, id: string, status: AdminProduct['status']): Promise<AdminProduct> {
  return run(token, (ctx) => {
    requirePermission(ctx, 'products.manage')
    requireWritable(ctx)
    const p = ownedOrNotFound(ctx, ctx.db.products.find((x) => x.id === id && x.tenantId === ctx.tenant?.id), 'Product')
    p.status = status
    p.updatedAt = nowIso()
    audit(ctx.db, ctx, status === 'hidden' ? 'product.hide' : 'product.show', p.name)
    return p
  })
}

export function adjustStock(token: string, id: string, branchId: string, delta: number, reason: string): Promise<AdminProduct> {
  return run(token, (ctx) => {
    requirePermission(ctx, 'inventory.manage')
    requireWritable(ctx)
    assertBranchAccess(ctx, branchId)
    const p = ownedOrNotFound(ctx, ctx.db.products.find((x) => x.id === id && x.tenantId === ctx.tenant?.id), 'Product')
    if (!Number.isInteger(delta) || delta === 0) throw new ApiError(422, 'Enter a whole number other than zero.')
    const before = p.stock[branchId] ?? 0
    if (before + delta < 0) throw new ApiError(422, `Stock can’t go below zero (currently ${before}).`)
    if (!sanitize(reason)) throw new ApiError(422, 'Give a reason for the adjustment.')
    p.stock[branchId] = before + delta
    p.updatedAt = nowIso()
    const branch = ctx.db.branches.find((b) => b.id === branchId)
    audit(ctx.db, ctx, 'inventory.adjust', p.name, `${branch?.name}: ${before} → ${p.stock[branchId]} (${delta > 0 ? '+' : ''}${delta}) · ${sanitize(reason, 120)}`)
    return { ...p, stock: Object.fromEntries(Object.entries(p.stock).filter(([b]) => allowedBranchIds(ctx).has(b))) }
  })
}

/**
 * POST /media/product-images — store a processed product photo.
 * The file signature is re-checked server-side; only WebP/PNG/JPEG under 2 MB are accepted.
 */
export async function uploadProductImage(token: string, blob: Blob, size: { width: number; height: number }): Promise<string> {
  return storeUpload(token, 'products.manage', blob, size, 'product')
}

/** Shared by product photos and branding images: auth, plan state, signature + size checks, then store. */
export async function storeUpload(
  token: string,
  permission: 'products.manage' | 'settings.manage',
  blob: Blob,
  size: { width: number; height: number },
  purpose: NonNullable<MediaRecord['purpose']>,
): Promise<string> {
  await latency(250, 600)
  const ctx = authenticate(token)
  requirePermission(ctx, permission)
  const t = requireWritable(ctx)
  if (blob.size > 2 * 1024 * 1024) throw new ApiError(413, 'The processed image is too large (max 2 MB).')
  const kind = await sniffImageType(blob)
  if (!kind) throw new ApiError(415, 'Only JPG, PNG or WebP images are accepted.')
  if (size.width < 100 || size.height < 100) throw new ApiError(422, 'The image is too small.')
  const id = randomId(12)
  await putMedia(id, blob)
  const db = readAdminDb()
  db.media.push({ id, tenantId: t.id, uploadedBy: ctx.staff.id, bytes: blob.size, type: `image/${kind}`, width: size.width, height: size.height, createdAt: nowIso(), purpose })
  const label = { product: 'Product photo', logo: 'Store logo', banner: 'Store banner' }[purpose]
  audit(db, ctx, 'media.upload', label, `${Math.round(blob.size / 1024)} KB · ${size.width}×${size.height}`)
  writeAdminDb(db)
  return `media:${id}`
}

// ================================================================== categories

export function listCategories(token: string): Promise<AdminCategory[]> {
  return run(token, (ctx) => {
    requirePermission(ctx, 'products.view')
    return inTenant(ctx, ctx.db.categories).sort((a, b) => a.order - b.order)
  })
}

export type CategoryInput = Pick<AdminCategory, 'name' | 'description' | 'color' | 'visible' | 'icon' | 'area'>

const CATEGORY_ICONS: IconName[] = ['apple', 'bread', 'milk', 'snowflake', 'bottle', 'cookie', 'wheat', 'spray', 'sparkle', 'home', 'basket', 'gift', 'tag', 'package', 'cart', 'store']
export const categoryIconChoices = CATEGORY_ICONS

function cleanCategory(ctx: AdminContext, input: CategoryInput, id?: string) {
  const name = sanitize(input.name, 40)
  if (name.length < 2) throw new ApiError(422, 'Enter a category name.')
  if (inTenant(ctx, ctx.db.categories).some((c) => c.id !== id && c.name.toLowerCase() === name.toLowerCase())) throw new ApiError(409, 'You already have a category with that name.')
  if (!/^#[0-9a-f]{6}$/i.test(input.color)) throw new ApiError(422, 'Pick a valid colour.')
  if (!CATEGORY_ICONS.includes(input.icon)) throw new ApiError(422, 'Choose an icon.')
  if (!STORE_AREAS.includes(input.area)) throw new ApiError(422, 'Choose where it’s shelved in the store.')
  return { name, description: sanitize(input.description, 200), color: input.color.toLowerCase(), icon: input.icon, area: input.area, visible: !!input.visible }
}

/** Add one of the supermarket's own categories. */
export function createCategory(token: string, input: CategoryInput): Promise<AdminCategory> {
  return run(token, (ctx) => {
    requirePermission(ctx, 'categories.manage')
    const t = requireWritable(ctx)
    const fields = cleanCategory(ctx, input)
    const mine = inTenant(ctx, ctx.db.categories)
    if (mine.length >= 40) throw new ApiError(422, 'You can have up to 40 categories.')
    const c: AdminCategory = { ...fields, id: `cat_${randomId(4)}`, tenantId: t.id, order: Math.max(-1, ...mine.map((x) => x.order)) + 1, standard: false }
    ctx.db.categories.push(c)
    audit(ctx.db, ctx, 'category.create', c.name, `Shelved in the ${STANDARD_CATEGORIES.find((s) => s.area === c.area)?.name} area`)
    return c
  })
}

export function updateCategory(token: string, id: CategoryId, input: CategoryInput): Promise<AdminCategory> {
  return run(token, (ctx) => {
    requirePermission(ctx, 'categories.manage')
    requireWritable(ctx)
    const c = ownedOrNotFound(ctx, ctx.db.categories.find((x) => x.id === id && x.tenantId === ctx.tenant?.id), 'Category')
    Object.assign(c, cleanCategory(ctx, input, id))
    audit(ctx.db, ctx, 'category.update', c.name, c.visible ? 'Visible' : 'Hidden from store')
    return c
  })
}

/** Move a category up or down the shop's list. */
export function moveCategory(token: string, id: CategoryId, dir: -1 | 1): Promise<AdminCategory[]> {
  return run(token, (ctx) => {
    requirePermission(ctx, 'categories.manage')
    requireWritable(ctx)
    const list = inTenant(ctx, ctx.db.categories).sort((a, b) => a.order - b.order)
    const i = list.findIndex((c) => c.id === id)
    const j = i + dir
    if (i < 0) throw new ApiError(404, 'Category not found.')
    if (j >= 0 && j < list.length) [list[i], list[j]] = [list[j]!, list[i]!]
    list.forEach((c, k) => (c.order = k))
    return list
  })
}

/**
 * Remove a category. Its products (and any offers on it) move to another of
 * the supermarket's categories, or the products are hidden from the shop.
 */
export function deleteCategory(token: string, id: CategoryId, opts: { moveTo?: CategoryId; hideProducts?: boolean }): Promise<{ moved: number; hidden: number }> {
  return run(token, (ctx) => {
    requirePermission(ctx, 'categories.manage')
    requireStepUp(ctx)
    const t = requireWritable(ctx)
    const c = ownedOrNotFound(ctx, ctx.db.categories.find((x) => x.id === id && x.tenantId === t.id), 'Category')
    const target = opts.moveTo ? ctx.db.categories.find((x) => x.id === opts.moveTo && x.tenantId === t.id && x.id !== id) : undefined
    if (opts.moveTo && !target) throw new ApiError(422, 'Choose another of your categories to move the products to.')
    const items = inTenant(ctx, ctx.db.products).filter((p) => p.categoryId === id)
    if (items.length && !target && !opts.hideProducts) throw new ApiError(409, `${c.name} still has ${items.length} products — move them to another category first.`)
    let hidden = 0
    for (const p of items) {
      if (target) p.categoryId = target.id
      else {
        p.status = 'hidden'
        hidden++
      }
    }
    // Offers on this category follow its products (or are paused).
    for (const o of inTenant(ctx, ctx.db.offers)) {
      const r = o.rule
      if ((r.kind === 'percent-category' || r.kind === 'bxgy') && r.categoryId === id) {
        if (target) r.categoryId = target.id
        else o.status = 'paused'
      }
    }
    ctx.db.categories = ctx.db.categories.filter((x) => x !== c)
    inTenant(ctx, ctx.db.categories).sort((a, b) => a.order - b.order).forEach((x, k) => (x.order = k))
    audit(ctx.db, ctx, 'category.delete', c.name, target ? `${items.length} products moved to ${target.name}` : `${hidden} products hidden`, 'warning')
    return { moved: target ? items.length : 0, hidden }
  })
}

/** Bring back one of HelaMart's standard categories that was removed. */
export function restoreStandardCategory(token: string, id: CategoryId): Promise<AdminCategory> {
  return run(token, (ctx) => {
    requirePermission(ctx, 'categories.manage')
    const t = requireWritable(ctx)
    const std = STANDARD_CATEGORIES.find((s) => s.id === id)
    if (!std) throw new ApiError(404, 'Not a standard category.')
    if (ctx.db.categories.some((c) => c.tenantId === t.id && c.id === id)) throw new ApiError(409, `${std.name} is already in your store.`)
    const mine = inTenant(ctx, ctx.db.categories)
    const c: AdminCategory = { id: std.id, tenantId: t.id, name: std.name, description: std.description, color: std.color, icon: std.icon, area: std.area, visible: true, order: Math.max(-1, ...mine.map((x) => x.order)) + 1, standard: true }
    ctx.db.categories.push(c)
    audit(ctx.db, ctx, 'category.restore', c.name)
    return c
  })
}

// ================================================================== customers (registered with this chain, all of Sri Lanka)

export type ChainCustomer = Omit<Customer, 'tenantIds' | 'blockedByTenants'> & { blockedHere: boolean; chainOrders: number; chainSpentCents: number }

export function listChainCustomers(token: string): Promise<ChainCustomer[]> {
  return run(token, (ctx) => {
    requirePermission(ctx, 'customers.view')
    const t = requireTenant(ctx)
    return ctx.db.customers
      .filter((c) => c.tenantIds.includes(t.id))
      .map(({ tenantIds: _t, blockedByTenants, ...c }) => {
        const mine = ctx.db.orders.filter((o) => o.customerId === c.id && o.tenantId === t.id && o.status !== 'cancelled')
        return { ...c, blockedHere: blockedByTenants.includes(t.id), chainOrders: mine.length, chainSpentCents: mine.filter((o) => o.status !== 'refunded').reduce((s, o) => s + o.breakdown.totalCents, 0) }
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  })
}

export function chainCustomerOrders(token: string, customerId: string): Promise<AdminOrder[]> {
  return run(token, (ctx) => {
    requirePermission(ctx, 'customers.view', 'orders.view')
    const allowed = allowedBranchIds(ctx)
    return inTenant(ctx, ctx.db.orders).filter((o) => o.customerId === customerId && allowed.has(o.branchId))
  })
}

export function setChainCustomerBlock(token: string, customerId: string, blocked: boolean, reason: string): Promise<void> {
  return run(token, (ctx) => {
    requirePermission(ctx, 'customers.manage')
    requireStepUp(ctx)
    const t = requireWritable(ctx)
    const c = ctx.db.customers.find((x) => x.id === customerId && x.tenantIds.includes(t.id))
    if (!c) throw new ApiError(404, 'Customer not found.')
    if (blocked && !sanitize(reason)) throw new ApiError(422, 'Give a reason for blocking.')
    c.blockedByTenants = blocked ? [...new Set([...c.blockedByTenants, t.id])] : c.blockedByTenants.filter((x) => x !== t.id)
    audit(ctx.db, ctx, blocked ? 'customer.block' : 'customer.unblock', c.name, sanitize(reason, 160), 'warning')
  })
}

// ================================================================== promotions

export function listOffers(token: string): Promise<AdminOffer[]> {
  return run(token, (ctx) => {
    requirePermission(ctx, 'promotions.view')
    const allowed = allowedBranchIds(ctx)
    return inTenant(ctx, ctx.db.offers).filter((o) => !o.branchIds.length || o.branchIds.some((b) => allowed.has(b)))
  })
}

export interface OfferInput {
  code: string
  title: string
  description: string
  rule: OfferRule
  expiresAt: string
  audience: AdminOffer['audience']
  customerIds: string[]
  branchIds: string[]
  conditions?: OfferConditions
  /** Show as "Coming soon" before it starts. */
  announce?: boolean
}

/** Validates and normalises an offer's conditions (minimum spend, days, hours…). */
function cleanConditions(c: OfferConditions | undefined, expiresAt: string): OfferConditions | undefined {
  if (!c) return undefined
  const out: OfferConditions = {}
  const int = (v: unknown) => (v === undefined || v === null || v === '' ? undefined : Math.floor(Number(v)))
  const minSpend = int(c.minSpendCents)
  if (minSpend !== undefined) {
    if (!(minSpend >= 0 && minSpend <= 10_000_000_00)) throw new ApiError(422, 'Enter a valid minimum spend.')
    if (minSpend > 0) out.minSpendCents = minSpend
  }
  const minItems = int(c.minItems)
  if (minItems !== undefined) {
    if (!(minItems >= 1 && minItems <= 200)) throw new ApiError(422, 'Minimum items must be 1–200.')
    if (minItems > 1) out.minItems = minItems
  }
  if (c.days?.length) {
    const days = [...new Set(c.days.map(Number))].filter((d) => d >= 0 && d <= 6).sort()
    if (!days.length) throw new ApiError(422, 'Choose valid days.')
    if (days.length < 7) out.days = days
  }
  const from = int(c.fromHour)
  const to = int(c.toHour)
  if (from !== undefined || to !== undefined) {
    if (from === undefined || to === undefined || !(from >= 0 && from <= 23) || !(to >= 1 && to <= 24) || from === to) throw new ApiError(422, 'Choose a valid time window (start and end hour).')
    out.fromHour = from
    out.toHour = to
  }
  if (c.startsAt) {
    const t = Date.parse(c.startsAt)
    if (Number.isNaN(t)) throw new ApiError(422, 'Choose a valid start date.')
    if (t >= Date.parse(expiresAt)) throw new ApiError(422, 'The offer must start before it expires.')
    out.startsAt = new Date(t).toISOString()
  }
  if (c.fulfilment) {
    if (c.fulfilment !== 'delivery' && c.fulfilment !== 'pickup') throw new ApiError(422, 'Choose delivery or pickup.')
    out.fulfilment = c.fulfilment
  }
  const limit = int(c.perCustomerLimit)
  if (limit !== undefined) {
    if (!(limit >= 1 && limit <= 50)) throw new ApiError(422, 'Uses per customer must be 1–50.')
    out.perCustomerLimit = limit
  }
  return Object.keys(out).length ? out : undefined
}

export function saveOffer(token: string, input: OfferInput, id?: string): Promise<AdminOffer> {
  return run(token, (ctx) => {
    requirePermission(ctx, 'promotions.manage')
    const t = requireWritable(ctx)
    const code = input.code.trim().toUpperCase()
    if (!/^[A-Z0-9]{4,16}$/.test(code)) throw new ApiError(422, 'Code must be 4–16 letters or numbers.')
    if (ctx.db.offers.some((o) => o.tenantId === t.id && o.code === code && o.id !== id)) throw new ApiError(409, 'That code is already used by another of your offers.')
    if (sanitize(input.title, 80).length < 3) throw new ApiError(422, 'Enter a title.')
    if (Number.isNaN(Date.parse(input.expiresAt)) || Date.parse(input.expiresAt) < Date.now()) throw new ApiError(422, 'Expiry must be in the future.')
    const r = input.rule
    if ((r.kind === 'percent-category' || r.kind === 'percent-product') && !(r.percent > 0 && r.percent <= 90)) throw new ApiError(422, 'Percentage must be between 1 and 90.')
    if (r.kind === 'fixed-off' && !(r.amountCents > 0 && r.minSpendCents >= 0)) throw new ApiError(422, 'Enter a valid discount and minimum spend.')
    if (r.kind === 'bxgy' && !(r.buy >= 1 && r.get >= 1)) throw new ApiError(422, 'Buy and get quantities must be at least 1.')
    if (r.kind === 'percent-order' && !(r.percent > 0 && r.percent <= 90 && r.minSpendCents >= 0 && (r.maxDiscountCents ?? 1) > 0)) throw new ApiError(422, 'Enter a valid basket percentage, minimum spend and cap.')
    if (r.kind === 'free-delivery' && !(r.minSpendCents >= 0)) throw new ApiError(422, 'Enter a valid minimum spend.')
    const conditions = cleanConditions(input.conditions, input.expiresAt)
    const allowed = allowedBranchIds(ctx)
    if (input.branchIds.some((b) => !allowed.has(b))) throw new ApiError(403, 'You can only run offers at your own branches.', 'BRANCH_FORBIDDEN')
    if (!isChainLevel(ctx) && !input.branchIds.length) throw new ApiError(422, 'Choose the branches this offer runs at.')
    if (input.audience === 'selected') {
      if (!input.customerIds.length) throw new ApiError(422, 'Choose at least one customer.')
      if (input.customerIds.some((cid) => !ctx.db.customers.find((c) => c.id === cid)?.tenantIds.includes(t.id))) throw new ApiError(403, 'You can only target your own customers.')
    }
    const base = { ...input, announce: !!input.announce && !!conditions?.startsAt, conditions, code, title: sanitize(input.title, 80), description: sanitize(input.description, 200), customerIds: input.audience === 'selected' ? input.customerIds : [] }
    if (id) {
      const o = ownedOrNotFound(ctx, ctx.db.offers.find((x) => x.id === id), 'Offer')
      Object.assign(o, base)
      audit(ctx.db, ctx, 'promotion.update', o.code, o.title)
      return o
    }
    const offer: AdminOffer = { ...base, id: `off_${randomId(5)}`, tenantId: t.id, status: 'active', usageCount: 0, createdAt: nowIso() }
    ctx.db.offers.unshift(offer)
    audit(ctx.db, ctx, 'promotion.create', offer.code, offer.title)
    return offer
  })
}

export function setOfferStatus(token: string, id: string, status: AdminOffer['status']): Promise<AdminOffer> {
  return run(token, (ctx) => {
    requirePermission(ctx, 'promotions.manage')
    requireWritable(ctx)
    const o = ownedOrNotFound(ctx, ctx.db.offers.find((x) => x.id === id), 'Offer')
    o.status = status
    audit(ctx.db, ctx, status === 'paused' ? 'promotion.pause' : 'promotion.resume', o.code)
    return o
  })
}

/** Quick schedule changes: publish a scheduled offer now, or end a live one now. */
export function setOfferSchedule(token: string, id: string, action: 'publish-now' | 'end-now'): Promise<AdminOffer> {
  return run(token, (ctx) => {
    requirePermission(ctx, 'promotions.manage')
    requireWritable(ctx)
    const o = ownedOrNotFound(ctx, ctx.db.offers.find((x) => x.id === id), 'Offer')
    if (action === 'publish-now') {
      if (o.conditions) delete o.conditions.startsAt
      o.status = 'active'
    } else o.expiresAt = nowIso()
    audit(ctx.db, ctx, action === 'publish-now' ? 'promotion.publish_now' : 'promotion.end_now', o.code, o.title)
    return o
  })
}

export function deleteOffer(token: string, id: string): Promise<void> {
  return run(token, (ctx) => {
    requirePermission(ctx, 'promotions.manage')
    requireWritable(ctx)
    const o = ownedOrNotFound(ctx, ctx.db.offers.find((x) => x.id === id), 'Offer')
    ctx.db.offers = ctx.db.offers.filter((x) => x.id !== id)
    audit(ctx.db, ctx, 'promotion.delete', o.code, o.title, 'warning')
  })
}

// ================================================================== chain settings

/** Brand colour, logo and banners are not here: they go through HelaMart approval (see brandingApi). */
export type ChainSettings = Pick<Tenant, 'name' | 'hotline' | 'supportEmail' | 'defaultHours' | 'deliveryFeeCents' | 'minOrderCents'>

export function getChainSettings(token: string): Promise<ChainSettings & { status: Tenant['status']; statusReason?: string; plan: Tenant['plan']; commissionPercent: number; reference: string }> {
  return run(token, (ctx) => {
    requirePermission(ctx, 'settings.manage')
    const t = requireTenant(ctx)
    return { name: t.name, hotline: t.hotline, supportEmail: t.supportEmail, defaultHours: t.defaultHours, deliveryFeeCents: t.deliveryFeeCents, minOrderCents: t.minOrderCents, status: t.status, statusReason: t.statusReason, plan: t.plan, commissionPercent: t.commissionPercent, reference: t.reference }
  })
}

export function updateChainSettings(token: string, next: ChainSettings): Promise<ChainSettings> {
  return run(token, (ctx) => {
    requirePermission(ctx, 'settings.manage')
    requireStepUp(ctx)
    const t = requireWritable(ctx)
    if (sanitize(next.name, 60).length < 2) throw new ApiError(422, 'Enter the supermarket name.')
    if (!Number.isInteger(next.deliveryFeeCents) || next.deliveryFeeCents < 0) throw new ApiError(422, 'Enter a valid delivery fee.')
    if (!Number.isInteger(next.minOrderCents) || next.minOrderCents < 0) throw new ApiError(422, 'Enter a valid minimum order.')
    Object.assign(t, { name: sanitize(next.name, 60), hotline: sanitize(next.hotline, 30), supportEmail: sanitize(next.supportEmail, 80), defaultHours: sanitize(next.defaultHours, 80), deliveryFeeCents: next.deliveryFeeCents, minOrderCents: next.minOrderCents })
    audit(ctx.db, ctx, 'settings.update', t.name, `Delivery ${money(t.deliveryFeeCents)} · minimum order ${money(t.minOrderCents)}`)
    return next
  })
}
