import type {
  AdminCategory,
  AdminOffer,
  AdminOrder,
  AdminProduct,
  AuditEntry,
  Customer,
  DashboardStats,
  OrderStatus,
  Permission,
  Role,
  StaffTask,
  StaffView,
  StoreSettings,
  TaskStatus,
} from '~/types/admin'
import type { CategoryId, OfferRule, ProductShape } from '~/types'
import { ALL_PERMISSIONS, ROLE_IDS } from '~/data/admin/permissions'
import { EMAIL_RE, isSriLankanMobile } from '~/utils/validation'
import { ApiError } from '../apiError'
import { hashPassword, latency, randomId } from '../mock/server'
import { readAdminDb, resetAdminDb, writeAdminDb } from './db'
import {
  assertCanManageLevel,
  assertGrantable,
  audit,
  authenticate,
  isSuperAdmin,
  requirePermission,
  requireStepUp,
  roleOf,
  sanitize,
  toStaffView,
  type AdminContext,
} from './security'
import { assertPasswordPolicy } from './auth'

/**
 * Back-office API (mock). One function per future endpoint. Each call:
 * authenticate → check permission (+ password step-up for sensitive actions)
 * → validate input → change data → write an audit entry.
 */

const money = (c: number) => `Rs. ${(c / 100).toLocaleString('en-LK', { minimumFractionDigits: 2 })}`
const nowIso = () => new Date().toISOString()

async function run<T>(token: string, fn: (ctx: AdminContext) => T, ms: [number, number] = [120, 320]): Promise<T> {
  await latency(...ms)
  const ctx = authenticate(token)
  const result = fn(ctx)
  writeAdminDb(ctx.db)
  // Serialise like a real HTTP response (also strips any Vue proxies passed in).
  return result === undefined ? result : (JSON.parse(JSON.stringify(result)) as T)
}

// ================================================================== dashboard

export function getDashboard(token: string): Promise<DashboardStats> {
  return run(token, (ctx) => {
    requirePermission(ctx, 'dashboard.view')
    const showMoney = ctx.permissions.has('reports.view')
    const { orders, products, customers } = ctx.db
    const now = Date.now()
    const valid = orders.filter((o) => o.status !== 'cancelled' && o.status !== 'refunded')
    const last30 = valid.filter((o) => now - Date.parse(o.createdAt) < 30 * 864e5)
    const today = new Date().toDateString()
    const revenueByDay = Array.from({ length: 14 }, (_, i) => {
      const d = new Date(now - (13 - i) * 864e5)
      const dayOrders = valid.filter((o) => new Date(o.createdAt).toDateString() === d.toDateString())
      return { date: d.toISOString().slice(0, 10), cents: showMoney ? dayOrders.reduce((s, o) => s + o.breakdown.totalCents, 0) : 0, orders: dayOrders.length }
    })
    const statusOrder: OrderStatus[] = ['pending', 'packing', 'out_for_delivery', 'ready_for_pickup', 'delivered', 'cancelled', 'refunded']
    const units = new Map<string, { name: string; units: number; cents: number }>()
    for (const o of last30) for (const l of o.lines) {
      const u = units.get(l.productId) ?? { name: l.name, units: 0, cents: 0 }
      u.units += l.quantity
      u.cents += l.finalCents
      units.set(l.productId, u)
    }
    const r30 = last30.reduce((s, o) => s + o.breakdown.totalCents, 0)
    return {
      revenueTodayCents: showMoney ? valid.filter((o) => new Date(o.createdAt).toDateString() === today).reduce((s, o) => s + o.breakdown.totalCents, 0) : 0,
      revenue30dCents: showMoney ? r30 : 0,
      orders30d: last30.length,
      avgOrderCents: showMoney && last30.length ? Math.round(r30 / last30.length) : 0,
      pendingOrders: orders.filter((o) => o.status === 'pending' || o.status === 'packing').length,
      customers: customers.length,
      newCustomers30d: customers.filter((c) => now - Date.parse(c.createdAt) < 30 * 864e5).length,
      lowStock: products
        .filter((p) => p.status === 'active' && p.stock <= p.reorderLevel)
        .sort((a, b) => a.stock - b.stock)
        .slice(0, 8)
        .map((p) => ({ id: p.id, name: p.name, stock: p.stock, reorderLevel: p.reorderLevel })),
      revenueByDay,
      ordersByStatus: statusOrder.map((s) => ({ status: s, count: orders.filter((o) => o.status === s).length })),
      topProducts: [...units.entries()]
        .map(([id, u]) => ({ id, ...u, cents: showMoney ? u.cents : 0 }))
        .sort((a, b) => b.units - a.units)
        .slice(0, 6),
      recentOrders: orders.slice(0, 6).map((o) => ({ id: o.id, number: o.number, createdAt: o.createdAt, customerName: o.customerName, status: o.status, breakdown: o.breakdown })),
    }
  })
}

// ================================================================== orders

export function listOrders(token: string): Promise<AdminOrder[]> {
  return run(token, (ctx) => {
    requirePermission(ctx, 'orders.view')
    return [...ctx.db.orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
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
  return NEXT[order.status].filter((s) =>
    s === 'out_for_delivery' ? order.delivery.method === 'delivery' : s === 'ready_for_pickup' ? order.delivery.method === 'pickup' : true,
  )
}

export function updateOrderStatus(token: string, orderId: string, status: OrderStatus, note = ''): Promise<AdminOrder> {
  return run(token, (ctx) => {
    requirePermission(ctx, status === 'refunded' ? 'orders.refund' : 'orders.manage')
    if (status === 'refunded') requireStepUp(ctx)
    const order = ctx.db.orders.find((o) => o.id === orderId)
    if (!order) throw new ApiError(404, 'Order not found.')
    if (!allowedTransitions(order).includes(status)) throw new ApiError(409, `An order that is “${order.status.replace(/_/g, ' ')}” can’t move to “${status.replace(/_/g, ' ')}”.`)
    if (status === 'cancelled' || status === 'refunded') {
      if (!sanitize(note)) throw new ApiError(422, 'Please give a reason.')
      // Return stock for cancelled orders.
      if (status === 'cancelled') for (const l of order.lines) {
        const p = ctx.db.products.find((x) => x.id === l.productId)
        if (p) p.stock += l.quantity
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
    return ctx.db.products
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
}

function validateProduct(input: ProductInput) {
  if (sanitize(input.name, 80).length < 2) throw new ApiError(422, 'Enter a product name.')
  if (!Number.isInteger(input.priceCents) || input.priceCents <= 0 || input.priceCents > 100_000_000) throw new ApiError(422, 'Enter a valid price.')
  if (!/^#[0-9a-f]{6}$/i.test(input.color) || !/^#[0-9a-f]{6}$/i.test(input.accent)) throw new ApiError(422, 'Pick valid package colours.')
  if (!Number.isInteger(input.reorderLevel) || input.reorderLevel < 0) throw new ApiError(422, 'Reorder level must be 0 or more.')
}

export function createProduct(token: string, input: ProductInput & { stock: number }): Promise<AdminProduct> {
  return run(token, (ctx) => {
    requirePermission(ctx, 'products.manage')
    validateProduct(input)
    const id = `${sanitize(input.name, 40).toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${randomId(2)}`
    const product: AdminProduct = {
      ...input,
      id,
      name: sanitize(input.name, 80),
      brand: sanitize(input.brand, 60),
      description: sanitize(input.description, 300),
      stock: Math.max(0, Math.floor(input.stock)),
      status: 'active',
      updatedAt: nowIso(),
    }
    ctx.db.products.unshift(product)
    audit(ctx.db, ctx, 'product.create', product.name, `${money(product.priceCents)} · stock ${product.stock}`)
    return product
  })
}

export function updateProduct(token: string, id: string, input: ProductInput): Promise<AdminProduct> {
  return run(token, (ctx) => {
    requirePermission(ctx, 'products.manage')
    validateProduct(input)
    const p = ctx.db.products.find((x) => x.id === id)
    if (!p) throw new ApiError(404, 'Product not found.')
    const changes: string[] = []
    if (p.priceCents !== input.priceCents) changes.push(`price ${money(p.priceCents)} → ${money(input.priceCents)}`)
    if (p.name !== input.name) changes.push(`name “${p.name}” → “${input.name}”`)
    Object.assign(p, { ...input, name: sanitize(input.name, 80), brand: sanitize(input.brand, 60), description: sanitize(input.description, 300), updatedAt: nowIso() })
    audit(ctx.db, ctx, 'product.update', p.name, changes.join('; ') || 'Details updated')
    return p
  })
}

export function setProductStatus(token: string, id: string, status: AdminProduct['status']): Promise<AdminProduct> {
  return run(token, (ctx) => {
    requirePermission(ctx, 'products.manage')
    const p = ctx.db.products.find((x) => x.id === id)
    if (!p) throw new ApiError(404, 'Product not found.')
    p.status = status
    p.updatedAt = nowIso()
    audit(ctx.db, ctx, status === 'hidden' ? 'product.hide' : 'product.show', p.name)
    return p
  })
}

export function adjustStock(token: string, id: string, delta: number, reason: string): Promise<AdminProduct> {
  return run(token, (ctx) => {
    requirePermission(ctx, 'inventory.manage')
    const p = ctx.db.products.find((x) => x.id === id)
    if (!p) throw new ApiError(404, 'Product not found.')
    if (!Number.isInteger(delta) || delta === 0) throw new ApiError(422, 'Enter a whole number other than zero.')
    if (p.stock + delta < 0) throw new ApiError(422, `Stock can’t go below zero (currently ${p.stock}).`)
    if (!sanitize(reason)) throw new ApiError(422, 'Give a reason for the adjustment.')
    const before = p.stock
    p.stock += delta
    p.updatedAt = nowIso()
    audit(ctx.db, ctx, 'inventory.adjust', p.name, `${before} → ${p.stock} (${delta > 0 ? '+' : ''}${delta}) · ${sanitize(reason, 120)}`)
    return p
  })
}

// ================================================================== categories

export function listCategories(token: string): Promise<AdminCategory[]> {
  return run(token, (ctx) => {
    requirePermission(ctx, 'products.view')
    return ctx.db.categories
  })
}

export function updateCategory(token: string, id: CategoryId, input: Pick<AdminCategory, 'name' | 'description' | 'color' | 'visible'>): Promise<AdminCategory> {
  return run(token, (ctx) => {
    requirePermission(ctx, 'categories.manage')
    const c = ctx.db.categories.find((x) => x.id === id)
    if (!c) throw new ApiError(404, 'Category not found.')
    if (sanitize(input.name, 60).length < 2) throw new ApiError(422, 'Enter a category name.')
    if (!/^#[0-9a-f]{6}$/i.test(input.color)) throw new ApiError(422, 'Pick a valid colour.')
    Object.assign(c, { ...input, name: sanitize(input.name, 60), description: sanitize(input.description, 200) })
    audit(ctx.db, ctx, 'category.update', c.name, c.visible ? 'Visible' : 'Hidden from store')
    return c
  })
}

// ================================================================== customers

export function listCustomers(token: string): Promise<Customer[]> {
  return run(token, (ctx) => {
    requirePermission(ctx, 'customers.view')
    return [...ctx.db.customers].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  })
}

export function customerOrders(token: string, customerId: string): Promise<AdminOrder[]> {
  return run(token, (ctx) => {
    requirePermission(ctx, 'customers.view', 'orders.view')
    return ctx.db.orders.filter((o) => o.customerId === customerId)
  })
}

export function setCustomerStatus(token: string, id: string, status: Customer['status'], reason: string): Promise<Customer> {
  return run(token, (ctx) => {
    requirePermission(ctx, 'customers.manage')
    requireStepUp(ctx)
    const c = ctx.db.customers.find((x) => x.id === id)
    if (!c) throw new ApiError(404, 'Customer not found.')
    if (status === 'blocked' && !sanitize(reason)) throw new ApiError(422, 'Give a reason for blocking.')
    c.status = status
    audit(ctx.db, ctx, status === 'blocked' ? 'customer.block' : 'customer.unblock', c.name, sanitize(reason, 160), 'warning')
    return c
  })
}

// ================================================================== promotions

export function listOffers(token: string): Promise<AdminOffer[]> {
  return run(token, (ctx) => {
    requirePermission(ctx, 'promotions.view')
    return ctx.db.offers
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
}

function validateOffer(ctx: AdminContext, input: OfferInput, ignoreId?: string) {
  const code = input.code.trim().toUpperCase()
  if (!/^[A-Z0-9]{4,16}$/.test(code)) throw new ApiError(422, 'Code must be 4–16 letters or numbers.')
  if (ctx.db.offers.some((o) => o.code === code && o.id !== ignoreId)) throw new ApiError(409, 'That code is already used by another offer.')
  if (sanitize(input.title, 80).length < 3) throw new ApiError(422, 'Enter a title.')
  if (Number.isNaN(Date.parse(input.expiresAt)) || Date.parse(input.expiresAt) < Date.now()) throw new ApiError(422, 'Expiry must be in the future.')
  const r = input.rule
  if ((r.kind === 'percent-category' || r.kind === 'percent-product') && !(r.percent > 0 && r.percent <= 90)) throw new ApiError(422, 'Percentage must be between 1 and 90.')
  if (r.kind === 'fixed-off' && !(r.amountCents > 0 && r.minSpendCents >= 0)) throw new ApiError(422, 'Enter a valid discount and minimum spend.')
  if (r.kind === 'bxgy' && !(r.buy >= 1 && r.get >= 1)) throw new ApiError(422, 'Buy and get quantities must be at least 1.')
  if (input.audience === 'selected' && !input.customerIds.length) throw new ApiError(422, 'Choose at least one customer.')
  return code
}

export function saveOffer(token: string, input: OfferInput, id?: string): Promise<AdminOffer> {
  return run(token, (ctx) => {
    requirePermission(ctx, 'promotions.manage')
    const code = validateOffer(ctx, input, id)
    const base = { ...input, code, title: sanitize(input.title, 80), description: sanitize(input.description, 200), customerIds: input.audience === 'selected' ? input.customerIds : [] }
    if (id) {
      const o = ctx.db.offers.find((x) => x.id === id)
      if (!o) throw new ApiError(404, 'Offer not found.')
      Object.assign(o, base)
      audit(ctx.db, ctx, 'promotion.update', o.code, o.title)
      return o
    }
    const offer: AdminOffer = { ...base, id: `off_${randomId(5)}`, status: 'active', usageCount: 0, createdAt: nowIso() }
    ctx.db.offers.unshift(offer)
    audit(ctx.db, ctx, 'promotion.create', offer.code, offer.title)
    return offer
  })
}

export function setOfferStatus(token: string, id: string, status: AdminOffer['status']): Promise<AdminOffer> {
  return run(token, (ctx) => {
    requirePermission(ctx, 'promotions.manage')
    const o = ctx.db.offers.find((x) => x.id === id)
    if (!o) throw new ApiError(404, 'Offer not found.')
    o.status = status
    audit(ctx.db, ctx, status === 'paused' ? 'promotion.pause' : 'promotion.resume', o.code)
    return o
  })
}

export function deleteOffer(token: string, id: string): Promise<void> {
  return run(token, (ctx) => {
    requirePermission(ctx, 'promotions.manage')
    const o = ctx.db.offers.find((x) => x.id === id)
    if (!o) throw new ApiError(404, 'Offer not found.')
    ctx.db.offers = ctx.db.offers.filter((x) => x.id !== id)
    audit(ctx.db, ctx, 'promotion.delete', o.code, o.title, 'warning')
  })
}

// ================================================================== tasks

export function listTasks(token: string): Promise<{ tasks: StaffTask[]; scope: 'all' | 'mine' }> {
  return run(token, (ctx) => {
    requirePermission(ctx, 'tasks.view')
    const all = ctx.permissions.has('tasks.manage')
    return { tasks: all ? ctx.db.tasks : ctx.db.tasks.filter((t) => t.assigneeId === ctx.staff.id), scope: all ? 'all' : 'mine' }
  })
}

export interface TaskInput {
  title: string
  description: string
  assigneeId: string
  priority: StaffTask['priority']
  dueDate: string
}

export function saveTask(token: string, input: TaskInput, id?: string): Promise<StaffTask> {
  return run(token, (ctx) => {
    requirePermission(ctx, 'tasks.manage')
    if (sanitize(input.title, 100).length < 3) throw new ApiError(422, 'Enter a task title.')
    const assignee = ctx.db.staff.find((s) => s.id === input.assigneeId && s.status === 'active')
    if (!assignee) throw new ApiError(422, 'Choose an active staff member.')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)) throw new ApiError(422, 'Choose a due date.')
    const fields = { title: sanitize(input.title, 100), description: sanitize(input.description, 1000), assigneeId: assignee.id, priority: input.priority, dueDate: input.dueDate }
    if (id) {
      const t = ctx.db.tasks.find((x) => x.id === id)
      if (!t) throw new ApiError(404, 'Task not found.')
      Object.assign(t, fields, { updatedAt: nowIso() })
      audit(ctx.db, ctx, 'task.update', t.title, `Assigned to ${assignee.name}`)
      return t
    }
    const task: StaffTask = { ...fields, id: `tsk_${randomId(5)}`, createdById: ctx.staff.id, status: 'todo', createdAt: nowIso(), updatedAt: nowIso(), comments: [] }
    ctx.db.tasks.unshift(task)
    audit(ctx.db, ctx, 'task.create', task.title, `Assigned to ${assignee.name} · due ${task.dueDate}`)
    return task
  })
}

export function setTaskStatus(token: string, id: string, status: TaskStatus): Promise<StaffTask> {
  return run(token, (ctx) => {
    requirePermission(ctx, 'tasks.view')
    const t = ctx.db.tasks.find((x) => x.id === id)
    if (!t) throw new ApiError(404, 'Task not found.')
    if (t.assigneeId !== ctx.staff.id && !ctx.permissions.has('tasks.manage')) throw new ApiError(403, 'You can only update tasks assigned to you.', 'FORBIDDEN')
    t.status = status
    t.updatedAt = nowIso()
    audit(ctx.db, ctx, 'task.status', t.title, status.replace('_', ' '))
    return t
  })
}

export function commentOnTask(token: string, id: string, text: string): Promise<StaffTask> {
  return run(token, (ctx) => {
    requirePermission(ctx, 'tasks.view')
    const t = ctx.db.tasks.find((x) => x.id === id)
    if (!t) throw new ApiError(404, 'Task not found.')
    if (t.assigneeId !== ctx.staff.id && !ctx.permissions.has('tasks.manage')) throw new ApiError(403, 'You can only comment on your own tasks.', 'FORBIDDEN')
    const clean = sanitize(text, 500)
    if (!clean) throw new ApiError(422, 'Write a comment first.')
    t.comments.push({ at: nowIso(), byId: ctx.staff.id, text: clean })
    t.updatedAt = nowIso()
    return t
  })
}

export function deleteTask(token: string, id: string): Promise<void> {
  return run(token, (ctx) => {
    requirePermission(ctx, 'tasks.manage')
    const t = ctx.db.tasks.find((x) => x.id === id)
    if (!t) throw new ApiError(404, 'Task not found.')
    ctx.db.tasks = ctx.db.tasks.filter((x) => x.id !== id)
    audit(ctx.db, ctx, 'task.delete', t.title)
  })
}

/** Directory for assignee pickers (any task manager can see names). */
export function staffDirectory(token: string): Promise<{ id: string; name: string; title: string; avatarColor: string; status: string }[]> {
  return run(token, (ctx) => {
    requirePermission(ctx, 'tasks.view')
    return ctx.db.staff.map((s) => ({ id: s.id, name: s.name, title: s.title, avatarColor: s.avatarColor, status: s.status }))
  })
}

// ================================================================== staff

export function listStaff(token: string): Promise<StaffView[]> {
  return run(token, (ctx) => {
    requirePermission(ctx, 'staff.view')
    return ctx.db.staff.map((s) => toStaffView(ctx.db, s))
  })
}

export interface StaffInput {
  name: string
  email: string
  phone: string
  title: string
  roleId: string
  extraPermissions: Permission[]
}

function generateTempPassword() {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '@#$%&!?']
  const chars: string[] = []
  const rand = (n: number) => {
    const a = new Uint32Array(1)
    crypto.getRandomValues(a)
    return a[0]! % n
  }
  for (let i = 0; i < 14; i++) {
    const set = sets[i % sets.length]!
    chars.push(set[rand(set.length)]!)
  }
  return chars.sort(() => rand(3) - 1).join('')
}

function guardStaffChange(ctx: AdminContext, input: StaffInput, targetId?: string) {
  requirePermission(ctx, 'staff.manage')
  requireStepUp(ctx)
  const role = ctx.db.roles.find((r) => r.id === input.roleId)
  if (!role) throw new ApiError(422, 'Choose a role.')
  if (role.id === ROLE_IDS.superAdmin && !isSuperAdmin(ctx)) throw new ApiError(403, 'Only a Super Admin can appoint another Super Admin.', 'HIERARCHY')
  assertCanManageLevel(ctx, role.level, `the “${role.name}” role`)
  assertGrantable(ctx, [...role.permissions, ...input.extraPermissions])
  if (input.extraPermissions.some((p) => !ALL_PERMISSIONS.includes(p))) throw new ApiError(422, 'Unknown permission.')
  if (sanitize(input.name, 80).length < 3) throw new ApiError(422, 'Enter the full name.')
  if (!EMAIL_RE.test(input.email.trim())) throw new ApiError(422, 'Enter a valid email address.')
  if (input.phone && !isSriLankanMobile(input.phone)) throw new ApiError(422, 'Enter a Sri Lankan mobile number.')
  const email = input.email.trim().toLowerCase()
  if (ctx.db.staff.some((s) => s.email === email && s.id !== targetId)) throw new ApiError(409, 'A staff account with this email already exists.')
  return { role, email }
}

export function createStaff(token: string, input: StaffInput): Promise<{ staff: StaffView; tempPassword: string }> {
  return run(token, (ctx) => {
    const { role, email } = guardStaffChange(ctx, input)
    const tempPassword = generateTempPassword()
    const s = {
      id: `stf_${randomId(5)}`,
      name: sanitize(input.name, 80),
      email,
      phone: input.phone.trim() || undefined,
      title: sanitize(input.title, 80) || role.name,
      roleId: role.id,
      extraPermissions: input.extraPermissions,
      status: 'active' as const,
      mfaSecret: `${randomId(10)}-totp`,
      passwordHash: hashPassword(email, tempPassword),
      passwordChangedAt: nowIso(),
      mustChangePassword: true,
      createdAt: nowIso(),
      createdBy: ctx.staff.id,
      avatarColor: ['#174D38', '#2F6E8F', '#9E3A5A', '#B9803F', '#5E9E4A', '#5F7484'][Math.floor(Math.random() * 6)]!,
    }
    ctx.db.staff.push(s)
    audit(ctx.db, ctx, 'staff.create', s.name, `Role: ${role.name}${input.extraPermissions.length ? ` + ${input.extraPermissions.length} extra permissions` : ''}`, 'warning')
    return { staff: toStaffView(ctx.db, s), tempPassword }
  }, [400, 800])
}

function findManageable(ctx: AdminContext, id: string) {
  const target = ctx.db.staff.find((s) => s.id === id)
  if (!target) throw new ApiError(404, 'Staff member not found.')
  if (target.id === ctx.staff.id) throw new ApiError(403, 'You can’t change your own role, permissions or status. Ask another administrator.', 'SELF')
  assertCanManageLevel(ctx, roleOf(ctx.db, target).level, target.name)
  return target
}

function superAdminsLeft(ctx: AdminContext, excluding: string) {
  return ctx.db.staff.filter((s) => s.id !== excluding && s.roleId === ROLE_IDS.superAdmin && s.status === 'active').length
}

export function updateStaff(token: string, id: string, input: StaffInput): Promise<StaffView> {
  return run(token, (ctx) => {
    const target = findManageable(ctx, id)
    const { role, email } = guardStaffChange(ctx, input, id)
    if (target.roleId === ROLE_IDS.superAdmin && role.id !== ROLE_IDS.superAdmin && !superAdminsLeft(ctx, target.id)) {
      throw new ApiError(409, 'At least one active Super Admin must remain.')
    }
    const before = roleOf(ctx.db, target).name
    Object.assign(target, { name: sanitize(input.name, 80), email, phone: input.phone.trim() || undefined, title: sanitize(input.title, 80), roleId: role.id, extraPermissions: input.extraPermissions })
    // Permission changes take effect immediately: end their sessions so new access is re-evaluated.
    ctx.db.sessions.forEach((s) => s.staffId === target.id && (s.revoked = true))
    audit(ctx.db, ctx, 'staff.update', target.name, `Role ${before} → ${role.name}; extra permissions: ${input.extraPermissions.join(', ') || 'none'}`, 'warning')
    return toStaffView(ctx.db, target)
  })
}

export function setStaffStatus(token: string, id: string, status: StaffView['status'], reason: string): Promise<StaffView> {
  return run(token, (ctx) => {
    requirePermission(ctx, 'staff.manage')
    requireStepUp(ctx)
    const target = findManageable(ctx, id)
    if (status === 'suspended' && target.roleId === ROLE_IDS.superAdmin && !superAdminsLeft(ctx, target.id)) throw new ApiError(409, 'At least one active Super Admin must remain.')
    if (status === 'suspended' && !sanitize(reason)) throw new ApiError(422, 'Give a reason.')
    target.status = status
    if (status === 'suspended') ctx.db.sessions.forEach((s) => s.staffId === target.id && (s.revoked = true))
    audit(ctx.db, ctx, status === 'suspended' ? 'staff.suspend' : 'staff.reactivate', target.name, sanitize(reason, 160), 'warning')
    return toStaffView(ctx.db, target)
  })
}

export function resetStaffPassword(token: string, id: string): Promise<{ tempPassword: string }> {
  return run(token, (ctx) => {
    requirePermission(ctx, 'staff.manage')
    requireStepUp(ctx)
    const target = findManageable(ctx, id)
    const tempPassword = generateTempPassword()
    target.passwordHash = hashPassword(target.email, tempPassword)
    target.mustChangePassword = true
    target.passwordChangedAt = nowIso()
    ctx.db.sessions.forEach((s) => s.staffId === target.id && (s.revoked = true))
    audit(ctx.db, ctx, 'staff.password_reset', target.name, 'Temporary password issued; sessions ended', 'warning')
    return { tempPassword }
  })
}

export function revokeStaffSessions(token: string, id: string): Promise<void> {
  return run(token, (ctx) => {
    requirePermission(ctx, 'staff.manage')
    const target = findManageable(ctx, id)
    ctx.db.sessions.forEach((s) => s.staffId === target.id && (s.revoked = true))
    audit(ctx.db, ctx, 'staff.sessions_revoked', target.name, 'Signed out of all devices', 'warning')
  })
}

// ================================================================== roles

export function listRoles(token: string): Promise<(Role & { members: number })[]> {
  return run(token, (ctx) => {
    if (!ctx.permissions.has('roles.manage')) requirePermission(ctx, 'staff.view')
    return ctx.db.roles.map((r) => ({ ...r, members: ctx.db.staff.filter((s) => s.roleId === r.id).length })).sort((a, b) => b.level - a.level)
  })
}

export interface RoleInput {
  name: string
  description: string
  permissions: Permission[]
  level: number
}

export function saveRole(token: string, input: RoleInput, id?: string): Promise<Role> {
  return run(token, (ctx) => {
    requirePermission(ctx, 'roles.manage')
    requireStepUp(ctx)
    if (sanitize(input.name, 40).length < 3) throw new ApiError(422, 'Enter a role name.')
    if (!Number.isInteger(input.level) || input.level < 1 || input.level > 79) throw new ApiError(422, 'Seniority level must be between 1 and 79.')
    assertCanManageLevel(ctx, input.level, 'a role at that seniority')
    assertGrantable(ctx, input.permissions)
    if (!input.permissions.length) throw new ApiError(422, 'Give the role at least one permission.')
    const name = sanitize(input.name, 40)
    if (ctx.db.roles.some((r) => r.name.toLowerCase() === name.toLowerCase() && r.id !== id)) throw new ApiError(409, 'A role with this name already exists.')
    if (id) {
      const role = ctx.db.roles.find((r) => r.id === id)
      if (!role) throw new ApiError(404, 'Role not found.')
      if (role.system) throw new ApiError(403, 'Built-in roles can’t be changed.', 'SYSTEM_ROLE')
      assertCanManageLevel(ctx, role.level, `the “${role.name}” role`)
      const added = input.permissions.filter((p) => !role.permissions.includes(p))
      const removed = role.permissions.filter((p) => !input.permissions.includes(p))
      Object.assign(role, { name, description: sanitize(input.description, 200), permissions: input.permissions, level: input.level })
      ctx.db.sessions.forEach((s) => ctx.db.staff.find((x) => x.id === s.staffId)?.roleId === role.id && (s.revoked = true))
      audit(ctx.db, ctx, 'role.update', role.name, `+${added.length} / −${removed.length} permissions${added.length ? ` (added ${added.join(', ')})` : ''}`, 'warning')
      return role
    }
    const role: Role = { id: `role_${randomId(5)}`, name, description: sanitize(input.description, 200), permissions: input.permissions, system: false, level: input.level, createdAt: nowIso(), createdBy: ctx.staff.id }
    ctx.db.roles.push(role)
    audit(ctx.db, ctx, 'role.create', role.name, `${role.permissions.length} permissions · level ${role.level}`, 'warning')
    return role
  })
}

export function deleteRole(token: string, id: string): Promise<void> {
  return run(token, (ctx) => {
    requirePermission(ctx, 'roles.manage')
    requireStepUp(ctx)
    const role = ctx.db.roles.find((r) => r.id === id)
    if (!role) throw new ApiError(404, 'Role not found.')
    if (role.system) throw new ApiError(403, 'Built-in roles can’t be deleted.', 'SYSTEM_ROLE')
    assertCanManageLevel(ctx, role.level, `the “${role.name}” role`)
    const members = ctx.db.staff.filter((s) => s.roleId === id).length
    if (members) throw new ApiError(409, `${members} staff member${members === 1 ? ' still has' : 's still have'} this role. Move them to another role first.`)
    ctx.db.roles = ctx.db.roles.filter((r) => r.id !== id)
    audit(ctx.db, ctx, 'role.delete', role.name, undefined, 'warning')
  })
}

// ================================================================== audit & settings

export function listAudit(token: string): Promise<AuditEntry[]> {
  return run(token, (ctx) => {
    requirePermission(ctx, 'audit.view')
    return [...ctx.db.audit].reverse()
  })
}

export function getSettings(token: string): Promise<StoreSettings> {
  return run(token, (ctx) => {
    requirePermission(ctx, 'settings.manage')
    return ctx.db.settings
  })
}

export function updateSettings(token: string, next: StoreSettings): Promise<StoreSettings> {
  return run(token, (ctx) => {
    requirePermission(ctx, 'settings.manage')
    requireStepUp(ctx)
    const s = next.security
    const bad = (cond: boolean, msg: string) => {
      if (cond) throw new ApiError(422, msg)
    }
    bad(s.sessionIdleMinutes < 5 || s.sessionIdleMinutes > 60, 'Idle timeout must be 5–60 minutes.')
    bad(s.sessionMaxHours < 1 || s.sessionMaxHours > 24, 'Maximum session length must be 1–24 hours.')
    bad(s.maxLoginAttempts < 3 || s.maxLoginAttempts > 10, 'Allowed failed sign-ins must be 3–10.')
    bad(s.lockoutMinutes < 1 || s.lockoutMinutes > 120, 'Lockout must be 1–120 minutes.')
    bad(s.passwordMinLength < 10 || s.passwordMinLength > 64, 'Minimum password length must be 10–64.')
    bad(s.passwordExpiryDays < 0 || s.passwordExpiryDays > 365, 'Password expiry must be 0–365 days.')
    bad(!s.require2fa && !isSuperAdmin(ctx), 'Only a Super Admin can turn off two-factor sign-in.')
    bad(!Number.isInteger(next.deliveryFeeCents) || next.deliveryFeeCents < 0, 'Enter a valid delivery fee.')
    bad(sanitize(next.storeName, 60).length < 2, 'Enter the store name.')
    const before = ctx.db.settings
    const changed = Object.keys(next.security).filter((k) => before.security[k as keyof StoreSettings['security']] !== s[k as keyof StoreSettings['security']])
    ctx.db.settings = { ...next, storeName: sanitize(next.storeName, 60), hotline: sanitize(next.hotline, 30), supportEmail: sanitize(next.supportEmail, 80), openingHours: sanitize(next.openingHours, 80) }
    audit(ctx.db, ctx, 'settings.update', 'Store settings', changed.length ? `Security policy changed: ${changed.join(', ')}` : 'Store details updated', changed.length ? 'critical' : 'info')
    return ctx.db.settings
  })
}

/** Super Admin only: restore all admin sample data (testing aid). */
export async function resetSampleData(token: string) {
  await latency(300, 500)
  const ctx = authenticate(token)
  if (!isSuperAdmin(ctx)) throw new ApiError(403, 'Only a Super Admin can reset sample data.', 'FORBIDDEN')
  requireStepUp(ctx)
  resetAdminDb()
}
