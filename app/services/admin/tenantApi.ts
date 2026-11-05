import type { AdminCategory, AdminOffer, AdminOrder, AdminProduct, Branch, Customer, OrderStatus, Tenant, TenantDashboard } from '~/types/admin'
import type { CategoryId, IconName, OfferConditions, OfferRule, ProductShape } from '~/types'
import { locateBranch } from '~/data/places'
import { apiGet as get, apiSend as send, encodeId as id } from './common'

/**
 * Supermarket (tenant) portal API (HelaMart backend, /admin/store/*). The server filters every query to
 * the caller's chain and, for branch-level staff, to their branches. Records from other supermarkets
 * are reported as "not found" (no information leaks across tenants).
 */

// ================================================================== dashboard

export function getTenantDashboard(token: string, branchId: string | 'all' = 'all'): Promise<TenantDashboard> {
  return get(token, '/admin/store/dashboard', { branch: branchId })
}

// ================================================================== branches

export function listBranches(token: string): Promise<(Branch & { managerName: string | null; staffCount: number })[]> {
  return get(token, '/admin/store/branches')
}

/** Branch names for pickers (any supermarket staff). */
export function branchDirectory(token: string): Promise<{ id: string; name: string; status: Branch['status'] }[]> {
  return get(token, '/admin/store/branch-directory')
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

export function saveBranch(token: string, input: BranchInput, branchId?: string): Promise<Branch> {
  // Pin the branch on the map from its town (district centre when the town isn't known) so shoppers can find it by area.
  const pin = locateBranch({ city: input.city, district: input.district })
  const body = { ...input, lat: pin.lat, lng: pin.lng }
  return branchId ? send(token, 'PUT', `/admin/store/branches/${id(branchId)}`, body) : send(token, 'POST', '/admin/store/branches', body)
}

/** PUT /branches/:id/delivery — home delivery on, or pickup only (customers collect at the branch). */
export function setBranchDelivery(token: string, branchId: string, deliveryEnabled: boolean): Promise<Branch> {
  return send(token, 'PUT', `/admin/store/branches/${id(branchId)}/delivery`, { deliveryEnabled })
}

/**
 * PUT /branches/:id/coverage — the branch's home-delivery area (map polygon +
 * named cities/villages). Required before shoppers can see the branch.
 */
export function saveBranchCoverage(token: string, branchId: string, input: { polygon: [number, number][]; places: string[] }): Promise<Branch> {
  return send(token, 'PUT', `/admin/store/branches/${id(branchId)}/coverage`, input)
}

export function setBranchStatus(token: string, branchId: string, status: Branch['status'], reason: string): Promise<Branch> {
  return send(token, 'PUT', `/admin/store/branches/${id(branchId)}/status`, { status, reason })
}

// ================================================================== orders

export function listOrders(token: string): Promise<AdminOrder[]> {
  return get(token, '/admin/store/orders')
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

/** Where an order can go next (the server enforces the same rules). */
export function allowedTransitions(order: AdminOrder): OrderStatus[] {
  return NEXT[order.status].filter((s) => (s === 'out_for_delivery' ? order.delivery.method === 'delivery' : s === 'ready_for_pickup' ? order.delivery.method === 'pickup' : true))
}

export function updateOrderStatus(token: string, orderId: string, status: OrderStatus, note = '', reason?: string): Promise<AdminOrder> {
  return send(token, 'PUT', `/admin/store/orders/${id(orderId)}/status`, { status, note, reason })
}

// ================================================================== products & stock

export function listProducts(token: string): Promise<AdminProduct[]> {
  return get(token, '/admin/store/products')
}

export interface ProductInput {
  name: string
  brand: string
  categoryId: CategoryId
  size: string
  unit: string
  priceCents: number
  description: string
  /** Needed when there's no photo; null = photo only. */
  shape: ProductShape | null
  color: string
  accent: string
  badge?: AdminProduct['badge']
  reorderLevel: number
  /** What it costs the supermarket, for profit reports (saved only with "View financial reports"); null = not entered. */
  costCents?: number | null
  /** No VAT on this product (saved only with "View financial reports"). */
  vatExempt?: boolean
  /** `media:<id>` from uploadProductImage, or null to remove the photo. */
  image?: string | null
  /** New products only: make it this branch's own product (branch staff always add to their branch). */
  ownerBranchId?: string
  /** Does this product have a review section for shoppers? Required for a new product. */
  reviewsEnabled: boolean
}

export function createProduct(token: string, input: ProductInput): Promise<AdminProduct> {
  return send(token, 'POST', '/admin/store/products', input)
}

export function updateProduct(token: string, productId: string, input: ProductInput): Promise<AdminProduct> {
  return send(token, 'PUT', `/admin/store/products/${id(productId)}`, input)
}

export function setProductStatus(token: string, productId: string, status: AdminProduct['status']): Promise<AdminProduct> {
  return send(token, 'PUT', `/admin/store/products/${id(productId)}/status`, { status })
}

export function adjustStock(token: string, productId: string, branchId: string, delta: number, reason: string): Promise<AdminProduct> {
  return send(token, 'POST', `/admin/store/products/${id(productId)}/stock`, { branchId, delta, reason })
}

/** A branch's own price and range for a product (null price = the chain price). */
export function setBranchProduct(token: string, productId: string, branchId: string, input: { priceCents: number | null; sold: boolean }): Promise<AdminProduct> {
  return send(token, 'PUT', `/admin/store/products/${id(productId)}/branches/${id(branchId)}`, input)
}

/** Remove a product for good. */
export async function deleteProduct(token: string, productId: string): Promise<void> {
  await send(token, 'DELETE', `/admin/store/products/${id(productId)}`)
}

/**
 * POST /admin/media — store a processed product photo.
 * The file signature is re-checked server-side; only WebP/PNG/JPEG under 2 MB are accepted.
 */
export function uploadProductImage(token: string, blob: Blob, size: { width: number; height: number }): Promise<string> {
  return storeUpload(token, blob, size, 'product')
}

/** Uploads an image (product photo, store logo/banner, homepage banner) and returns its `media:<id>` reference. */
export async function storeUpload(token: string, blob: Blob, size: { width: number; height: number }, purpose: 'product' | 'logo' | 'banner'): Promise<string> {
  const form = new FormData()
  form.append('file', blob, `${purpose}.${blob.type.split('/')[1] ?? 'img'}`)
  form.append('width', String(Math.round(size.width)))
  form.append('height', String(Math.round(size.height)))
  form.append('purpose', purpose)
  return (await send<{ ref: string }>(token, 'POST', '/admin/media', form)).ref
}

// ================================================================== categories

export function listCategories(token: string): Promise<AdminCategory[]> {
  return get(token, '/admin/store/categories')
}

export type CategoryInput = Pick<AdminCategory, 'name' | 'description' | 'color' | 'visible' | 'icon' | 'area'>

const CATEGORY_ICONS: IconName[] = ['apple', 'bread', 'milk', 'snowflake', 'bottle', 'cookie', 'wheat', 'spray', 'sparkle', 'home', 'basket', 'gift', 'tag', 'package', 'cart', 'store']
export const categoryIconChoices = CATEGORY_ICONS

/** Add one of the supermarket's own categories. */
export function createCategory(token: string, input: CategoryInput): Promise<AdminCategory> {
  return send(token, 'POST', '/admin/store/categories', input)
}

export function updateCategory(token: string, categoryId: CategoryId, input: CategoryInput): Promise<AdminCategory> {
  return send(token, 'PUT', `/admin/store/categories/${id(categoryId)}`, input)
}

/** Move a category up or down the shop's list. */
export function moveCategory(token: string, categoryId: CategoryId, dir: -1 | 1): Promise<AdminCategory[]> {
  return send(token, 'POST', `/admin/store/categories/${id(categoryId)}/move`, { dir })
}

/**
 * Remove a category. Its products (and any offers on it) move to another of
 * the supermarket's categories, or the products are hidden from the shop.
 */
export function deleteCategory(token: string, categoryId: CategoryId, opts: { moveTo?: CategoryId; hideProducts?: boolean }): Promise<{ moved: number; hidden: number }> {
  return send(token, 'POST', `/admin/store/categories/${id(categoryId)}/delete`, opts)
}

/** Bring back one of HelaMart's standard categories that was removed. */
export function restoreStandardCategory(token: string, categoryId: CategoryId): Promise<AdminCategory> {
  return send(token, 'POST', `/admin/store/categories/restore/${id(categoryId)}`)
}

// ================================================================== customers (registered with this chain, all of Sri Lanka)

export type ChainCustomer = Omit<Customer, 'tenantIds' | 'blockedByTenants'> & { blockedHere: boolean; chainOrders: number; chainSpentCents: number }

export function listChainCustomers(token: string): Promise<ChainCustomer[]> {
  return get(token, '/admin/store/customers')
}

export function chainCustomerOrders(token: string, customerId: string): Promise<AdminOrder[]> {
  return get(token, `/admin/store/customers/${id(customerId)}/orders`)
}

export async function setChainCustomerBlock(token: string, customerId: string, blocked: boolean, reason: string): Promise<void> {
  await send(token, 'PUT', `/admin/store/customers/${id(customerId)}/block`, { blocked, reason })
}

// ================================================================== promotions

export function listOffers(token: string): Promise<AdminOffer[]> {
  return get(token, '/admin/store/offers')
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

/** Form fields may hold "" for an empty number; the API wants them left out. */
function cleanConditions(c: OfferConditions | undefined) {
  if (!c) return undefined
  const num = (v: unknown) => (v === undefined || v === null || v === '' ? undefined : Math.floor(Number(v)))
  return { ...c, minSpendCents: num(c.minSpendCents), minItems: num(c.minItems), fromHour: num(c.fromHour), toHour: num(c.toHour), perCustomerLimit: num(c.perCustomerLimit), days: c.days?.map(Number) }
}

export function saveOffer(token: string, input: OfferInput, offerId?: string): Promise<AdminOffer> {
  const body = { ...input, conditions: cleanConditions(input.conditions) }
  return offerId ? send(token, 'PUT', `/admin/store/offers/${id(offerId)}`, body) : send(token, 'POST', '/admin/store/offers', body)
}

export function setOfferStatus(token: string, offerId: string, status: AdminOffer['status']): Promise<AdminOffer> {
  return send(token, 'PUT', `/admin/store/offers/${id(offerId)}/status`, { status })
}

/** Quick schedule changes: publish a scheduled offer now, or end a live one now. */
export function setOfferSchedule(token: string, offerId: string, action: 'publish-now' | 'end-now'): Promise<AdminOffer> {
  return send(token, 'POST', `/admin/store/offers/${id(offerId)}/schedule`, { action })
}

export async function deleteOffer(token: string, offerId: string): Promise<void> {
  await send(token, 'DELETE', `/admin/store/offers/${id(offerId)}`)
}

/** The chain's products, for picking what an offer applies to (no stock or prices needed). */
export async function listOfferProducts(token: string): Promise<{ id: string; name: string; brand: string; size: string; categoryId: CategoryId; hidden: boolean }[]> {
  const products = await listProducts(token)
  return products.map((p) => ({ id: p.id, name: p.name, brand: p.brand, size: p.size, categoryId: p.categoryId, hidden: p.status === 'hidden' }))
}

// ================================================================== chain settings

/** Brand colour, logo and banners are not here: they go through HelaMart approval (see brandingApi). */
export type ChainSettings = Pick<Tenant, 'name' | 'hotline' | 'supportEmail' | 'defaultHours' | 'deliveryFeeCents' | 'minOrderCents'> & {
  vatNumber?: string | null
  /** VAT rate for new orders; null = not VAT registered. Shelf prices include it. */
  vatPercent?: number | null
}

export function getChainSettings(token: string): Promise<ChainSettings & { status: Tenant['status']; statusReason?: string; plan: Tenant['plan']; commissionPercent: number; reference: string }> {
  return get(token, '/admin/store/settings')
}

export function updateChainSettings(token: string, next: ChainSettings): Promise<ChainSettings> {
  return send(token, 'PUT', '/admin/store/settings', next)
}
