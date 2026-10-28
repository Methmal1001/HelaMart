import type {
  AdminCategory,
  AdminOffer,
  AdminOrder,
  AdminProduct,
  AuditEntry,
  Customer,
  OrderStatus,
  Permission,
  Role,
  StaffTask,
  StaffUser,
  StoreSettings,
} from '~/types/admin'
import type { CartLine } from '~/types'
import { products } from '~/data/products'
import { categories } from '~/data/categories'
import { mockAccounts } from '~/data/mockUsers'
import { getProduct } from '~/data/products'
import { priceCart } from '~/utils/pricing'
import { ALL_PERMISSIONS, ROLE_IDS } from './permissions'

/**
 * SAMPLE ADMIN DATA — generated deterministically so every tester sees the
 * same store. Replaced by the real database when the backend exists.
 */

export const SEED_PASSWORDS = {
  superAdmin: 'Super@HelaMart2026',
  admin: 'Admin@HelaMart2026',
  staff: 'Staff@HelaMart2026',
} as const

function rng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const DAY = 864e5
const iso = (ms: number) => new Date(ms).toISOString()

export interface SeedInput {
  hashPassword: (email: string, password: string) => string
  now: number
}

export function buildSeed({ hashPassword, now }: SeedInput) {
  const r = rng(2026)
  const pick = <T,>(a: readonly T[]) => a[Math.floor(r() * a.length)]!

  // ------------------------------------------------------------------ roles
  const roles: Role[] = [
    {
      id: ROLE_IDS.superAdmin,
      name: 'Super Admin',
      description: 'Full control of the store, security settings and every account.',
      permissions: [...ALL_PERMISSIONS],
      system: true,
      level: 100,
      createdAt: iso(now - 200 * DAY),
    },
    {
      id: ROLE_IDS.admin,
      name: 'Admin',
      description: 'Runs the store day to day. Can manage staff, roles and tasks — but not security settings.',
      permissions: ALL_PERMISSIONS.filter((x) => x !== 'settings.manage'),
      system: true,
      level: 80,
      createdAt: iso(now - 200 * DAY),
    },
    {
      id: 'role_store_manager',
      name: 'Store Manager',
      description: 'Oversees orders, products, stock and promotions, and assigns tasks.',
      permissions: [
        'dashboard.view', 'reports.view', 'orders.view', 'orders.manage', 'orders.refund', 'products.view', 'products.manage',
        'inventory.manage', 'categories.manage', 'customers.view', 'promotions.view', 'promotions.manage', 'tasks.view', 'tasks.manage', 'staff.view',
      ] satisfies Permission[],
      system: false,
      level: 50,
      createdAt: iso(now - 150 * DAY),
      createdBy: 'stf_admin',
    },
    {
      id: 'role_inventory',
      name: 'Inventory Clerk',
      description: 'Receives deliveries and keeps stock counts accurate.',
      permissions: ['dashboard.view', 'products.view', 'inventory.manage', 'tasks.view'],
      system: false,
      level: 20,
      createdAt: iso(now - 120 * DAY),
      createdBy: 'stf_admin',
    },
    {
      id: 'role_support',
      name: 'Customer Support',
      description: 'Helps customers with orders and deliveries.',
      permissions: ['dashboard.view', 'orders.view', 'orders.manage', 'customers.view', 'promotions.view', 'tasks.view'],
      system: false,
      level: 20,
      createdAt: iso(now - 120 * DAY),
      createdBy: 'stf_admin',
    },
  ]

  // ------------------------------------------------------------------ staff
  const staffMember = (
    id: string,
    name: string,
    email: string,
    title: string,
    roleId: string,
    password: string,
    color: string,
    extra: Partial<StaffUser> = {},
  ): StaffUser => ({
    id,
    name,
    email,
    title,
    roleId,
    extraPermissions: [],
    status: 'active',
    mfaSecret: `${id}-totp-seed`,
    passwordHash: hashPassword(email, password),
    passwordChangedAt: iso(now - 20 * DAY),
    mustChangePassword: false,
    createdAt: iso(now - 180 * DAY),
    avatarColor: color,
    ...extra,
  })
  const staff: StaffUser[] = [
    staffMember('stf_super', 'Chamara Bandara', 'superadmin@helamart.test', 'Managing Director', ROLE_IDS.superAdmin, SEED_PASSWORDS.superAdmin, '#174D38', { phone: '+94 77 100 2000' }),
    staffMember('stf_admin', 'Ishara Wijesinghe', 'admin@helamart.test', 'Operations Lead', ROLE_IDS.admin, SEED_PASSWORDS.admin, '#2F6E8F', { phone: '+94 77 100 2001', createdBy: 'stf_super' }),
    staffMember('stf_manager', 'Dinesh Kumara', 'manager@helamart.test', 'Store Manager — Colombo', 'role_store_manager', SEED_PASSWORDS.staff, '#B9803F', { createdBy: 'stf_admin' }),
    staffMember('stf_stock', 'Nadeesha Herath', 'stock@helamart.test', 'Inventory Clerk', 'role_inventory', SEED_PASSWORDS.staff, '#5E9E4A', { createdBy: 'stf_manager' }),
    staffMember('stf_support', 'Thilini Ranasinghe', 'support@helamart.test', 'Customer Support Agent', 'role_support', SEED_PASSWORDS.staff, '#9E3A5A', { createdBy: 'stf_admin', extraPermissions: ['customers.manage'] }),
    staffMember('stf_former', 'Kasun Peris', 'kasun.p@helamart.test', 'Cashier (former)', 'role_support', SEED_PASSWORDS.staff, '#5F7484', { status: 'suspended', createdBy: 'stf_admin' }),
  ]

  // ------------------------------------------------------------------ catalogue
  const adminProducts: AdminProduct[] = products.map((prod) => {
    const roll = r()
    return {
      ...prod,
      stock: roll < 0.08 ? 0 : roll < 0.2 ? 3 + Math.floor(r() * 10) : 25 + Math.floor(r() * 140),
      reorderLevel: 15,
      status: 'active',
      updatedAt: iso(now - Math.floor(r() * 30) * DAY),
    }
  })
  const adminCategories: AdminCategory[] = categories.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    color: c.color,
    visible: true,
  }))

  // ------------------------------------------------------------------ customers
  const FIRST = ['Sahan', 'Nethmi', 'Kalum', 'Dilini', 'Pradeep', 'Ayesha', 'Ruwan', 'Hasini', 'Lahiru', 'Sanduni', 'Tharindu', 'Malsha', 'Isuru', 'Gayani', 'Janith', 'Piumi', 'Kavinda', 'Ishani', 'Chathura', 'Rashmi']
  const LAST = ['Perera', 'Fernando', 'Silva', 'Jayawardena', 'Gunasekara', 'Rajapaksha', 'Wickramasinghe', 'Dissanayake', 'Herath', 'Bandara', 'Karunaratne', 'Samarasinghe']
  const CITIES = ['Colombo', 'Dehiwala-Mount Lavinia', 'Sri Jayawardenepura Kotte', 'Moratuwa', 'Negombo', 'Kandy', 'Galle', 'Kurunegala']
  const customers: Customer[] = [
    ...mockAccounts.map((a, i) => ({
      id: a.user.id,
      name: a.user.name,
      email: a.user.email,
      phone: a.user.phone,
      provider: a.user.provider,
      status: 'active' as const,
      createdAt: iso(now - (160 - i * 10) * DAY),
      city: pick(CITIES),
      ordersCount: 0,
      totalSpentCents: 0,
    })),
    ...FIRST.map((first, i) => {
      const last = LAST[(i * 5) % LAST.length]!
      return {
        id: `cus_${i + 1}`,
        name: `${first} ${last}`,
        email: `${first}.${last}${i}@example.lk`.toLowerCase(),
        phone: `+94 7${Math.floor(r() * 9)} ${100 + Math.floor(r() * 899)} ${1000 + Math.floor(r() * 8999)}`,
        provider: (r() < 0.35 ? 'google' : 'password') as Customer['provider'],
        status: (i === 7 ? 'blocked' : 'active') as Customer['status'],
        createdAt: iso(now - Math.floor(5 + r() * 150) * DAY),
        city: pick(CITIES),
        ordersCount: 0,
        totalSpentCents: 0,
      }
    }),
  ]

  // ------------------------------------------------------------------ orders
  const orders: AdminOrder[] = []
  const SLOTS = ['Today, 4:00–6:00 PM', 'Tomorrow, 9:00–11:00 AM', 'Tomorrow, 2:00–4:00 PM']
  for (let i = 0; i < 60; i++) {
    const ageDays = Math.pow(r(), 1.4) * 30
    const created = now - ageDays * DAY - Math.floor(r() * 8) * 3600e3
    const cust = customers[Math.floor(r() * customers.length)]!
    const lineCount = 1 + Math.floor(r() * 5)
    const lines: CartLine[] = []
    for (let l = 0; l < lineCount; l++) {
      const prod = pick(products)
      if (!lines.some((x) => x.productId === prod.id)) lines.push({ productId: prod.id, quantity: 1 + Math.floor(r() * 3) })
    }
    const pickup = r() < 0.2
    const breakdown = priceCart(lines, [], { fulfilment: pickup ? 'pickup' : 'delivery' })
    const card = r() < 0.55
    let status: OrderStatus
    if (ageDays > 2) status = r() < 0.06 ? 'cancelled' : r() < 0.04 ? 'refunded' : 'delivered'
    else if (ageDays > 1) status = pickup ? 'ready_for_pickup' : 'out_for_delivery'
    else status = r() < 0.5 ? 'pending' : 'packing'
    const history = [{ at: iso(created), status: 'pending' as OrderStatus, by: 'Customer' }]
    if (status !== 'pending') history.push({ at: iso(created + 2 * 3600e3), status, by: pick(['Dinesh Kumara', 'Thilini Ranasinghe', 'Ishara Wijesinghe']) })
    orders.push({
      id: `ord_s${i + 1}`,
      number: `HM-2026-${String(9000 + i)}`,
      createdAt: iso(created),
      customerId: cust.id,
      customerName: cust.name,
      customerEmail: cust.email,
      lines: breakdown.lines.map((ln) => ({ ...ln, name: getProduct(ln.productId)!.name, size: getProduct(ln.productId)!.size })),
      breakdown,
      delivery: {
        method: pickup ? 'pickup' : 'delivery',
        fullName: cust.name,
        phone: cust.phone ?? '+94 77 000 0000',
        address: pickup ? '' : `No. ${1 + Math.floor(r() * 220)}, ${pick(['Galle Road', 'Kandy Road', 'Temple Road', 'Station Road', 'Lake Drive'])}`,
        city: cust.city,
        slot: pick(SLOTS),
        notes: '',
      },
      payment: { method: card ? 'card' : 'cod', cardLast4: card ? String(1000 + Math.floor(r() * 8999)) : undefined, status: status === 'refunded' ? 'refunded' : card ? 'paid' : 'pay-on-delivery' },
      status,
      history,
      source: 'sample',
    })
  }
  orders.sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  // ------------------------------------------------------------------ offers
  const offers: AdminOffer[] = []
  for (const acc of mockAccounts) {
    for (const o of acc.offers) {
      const existing = offers.find((x) => x.id === o.id)
      if (existing) existing.customerIds.push(acc.user.id)
      else offers.push({ ...o, status: 'active', audience: 'selected', customerIds: [acc.user.id], usageCount: Math.floor(r() * 40), createdAt: iso(now - 60 * DAY) })
    }
  }
  offers.push({
    id: 'off_newcustomer',
    code: 'HELLOHELA',
    title: 'New customer: Rs. 250 off',
    description: 'Rs. 250 off your order of Rs. 1,500 or more.',
    rule: { kind: 'fixed-off', amountCents: 25000, minSpendCents: 150000 },
    expiresAt: '2027-12-31T23:59:59+05:30',
    status: 'active',
    audience: 'new',
    customerIds: [],
    usageCount: 87,
    createdAt: iso(now - 90 * DAY),
  })

  // ------------------------------------------------------------------ tasks
  const task = (id: string, title: string, description: string, assigneeId: string, createdById: string, priority: StaffTask['priority'], status: StaffTask['status'], dueInDays: number): StaffTask => ({
    id,
    title,
    description,
    assigneeId,
    createdById,
    priority,
    status,
    dueDate: new Date(now + dueInDays * DAY).toISOString().slice(0, 10),
    createdAt: iso(now - 3 * DAY),
    updatedAt: iso(now - DAY),
    comments: [],
  })
  const tasks: StaffTask[] = [
    task('tsk_1', 'Restock Keeri Samba rice', 'Shelf in Aisle 1 is nearly empty. Receive the Polonnaruwa Mills delivery and update stock.', 'stf_stock', 'stf_manager', 'high', 'todo', 1),
    task('tsk_2', 'Plan Avurudu promotions', 'Draft the April seasonal offers for snacks and sweets.', 'stf_manager', 'stf_admin', 'medium', 'in_progress', 10),
    task('tsk_3', 'Call back customer about late delivery', 'Order HM-2026-9003 was delayed — confirm the new slot with the customer.', 'stf_support', 'stf_manager', 'urgent', 'todo', 0),
    task('tsk_4', 'Weekly chiller temperature check', 'Log the dairy and frozen cabinet temperatures.', 'stf_stock', 'stf_manager', 'medium', 'done', -1),
    task('tsk_5', 'Review staff access', 'Quarterly review: remove permissions no longer needed.', 'stf_admin', 'stf_super', 'high', 'todo', 5),
    task('tsk_6', 'Update bakery prices', 'Flour prices changed — review bakery item prices.', 'stf_manager', 'stf_admin', 'low', 'todo', 7),
  ]

  // ------------------------------------------------------------------ audit + settings
  const audit: AuditEntry[] = [
    { id: 'aud_s1', at: iso(now - 30 * DAY), actorId: 'stf_super', actorName: 'Chamara Bandara', action: 'role.update', target: 'Admin', details: 'Removed “Store & security settings” from Admin', severity: 'warning' },
    { id: 'aud_s2', at: iso(now - 12 * DAY), actorId: 'stf_admin', actorName: 'Ishara Wijesinghe', action: 'staff.suspend', target: 'Kasun Peris', details: 'Left the company', severity: 'warning' },
    { id: 'aud_s3', at: iso(now - 2 * DAY), actorId: 'stf_manager', actorName: 'Dinesh Kumara', action: 'product.update', target: 'Sandwich Bread', details: 'Price Rs. 200.00 → Rs. 210.00', severity: 'info' },
  ]

  const settings: StoreSettings = {
    storeName: 'HelaMart',
    hotline: '+94 11 200 3000',
    supportEmail: 'support@helamart.test',
    openingHours: 'Daily 7:00 AM – 10:00 PM',
    deliveryFeeCents: 35000,
    orderCutoffTime: '20:00',
    maintenanceMode: false,
    security: {
      sessionIdleMinutes: 15,
      sessionMaxHours: 8,
      maxLoginAttempts: 5,
      lockoutMinutes: 5,
      passwordMinLength: 12,
      passwordExpiryDays: 90,
      require2fa: true,
    },
  }

  return { roles, staff, products: adminProducts, categories: adminCategories, customers, orders, offers, tasks, audit, settings }
}
