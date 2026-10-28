import type {
  AdminCategory,
  AdminOffer,
  AdminOrder,
  AdminProduct,
  AuditEntry,
  Branch,
  Customer,
  OrderStatus,
  PlatformSettings,
  Role,
  StaffTask,
  StaffUser,
  Tenant,
  TenantStatus,
} from '~/types/admin'
import type { CartLine } from '~/types'
import { products } from '~/data/products'
import { categories } from '~/data/categories'
import { mockAccounts } from '~/data/mockUsers'
import { getProduct } from '~/data/products'
import { DISTRICTS } from '~/data/sriLanka'
import { priceCart } from '~/utils/pricing'
import { BRANCH_MANAGER_PERMISSIONS, PLATFORM_PERMISSIONS, ROLE_IDS, TENANT_PERMISSIONS } from './permissions'

/**
 * SAMPLE PLATFORM DATA — fictional supermarket chains, staff and customers,
 * generated deterministically. Replaced by the real database later.
 */

export const SEED_PASSWORDS = {
  superAdmin: 'Super@HelaMart2026',
  chainAdmin: 'Admin@HelaMart2026',
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

  // ------------------------------------------------------------------ supermarkets
  const tenant = (
    id: string, n: number, name: string, legal: string, district: string, status: TenantStatus, color: string,
    extra: Partial<Tenant> = {},
  ): Tenant => ({
    id,
    reference: `HMA-2026-${String(n).padStart(4, '0')}`,
    name,
    legalName: legal,
    brNumber: `PV ${String(10000 + n * 731).padStart(8, '0')}`,
    vatNumber: status === 'pending' ? undefined : `${100000000 + n * 7}-7000`,
    ownerName: '',
    ownerNic: `19${70 + n}${String(4000000 + n * 1311).slice(0, 8)}`,
    email: '',
    phone: `+94 11 ${200 + n} ${4000 + n * 11}`,
    hqAddress: '',
    district,
    brandColor: color,
    plan: 'standard',
    commissionPercent: 3.5,
    status,
    statusChangedAt: iso(now - (40 - n * 3) * DAY),
    documents: [
      { kind: 'br_certificate', fileName: 'business-registration.pdf', sizeKb: 812, verified: status !== 'pending' },
      { kind: 'owner_nic', fileName: 'owner-nic.jpg', sizeKb: 344, verified: status !== 'pending' },
      { kind: 'address_proof', fileName: 'utility-bill.pdf', sizeKb: 290, verified: status === 'active' || status === 'restricted' },
    ],
    firstBranch: { name: '', city: '', district },
    expectedBranches: 3,
    createdAt: iso(now - (200 - n * 20) * DAY),
    approvedAt: status === 'active' || status === 'restricted' || status === 'banned' ? iso(now - (180 - n * 20) * DAY) : undefined,
    hotline: `+94 11 ${300 + n} ${5000 + n}`,
    supportEmail: '',
    defaultHours: 'Daily 7:00 AM – 10:00 PM',
    deliveryFeeCents: 35000,
    minOrderCents: 100000,
    ...extra,
  })

  const tenants: Tenant[] = [
    tenant('tnt_lfm', 1, 'Lanka Fresh Mart', 'Lanka Fresh Mart (Pvt) Ltd', 'Gampaha', 'active', '#1F7A4D', {
      ownerName: 'Sunil Wickramaratne', email: 'owner@lankafresh.test', supportEmail: 'help@lankafresh.test', hqAddress: 'No. 45, Negombo Road, Divulapitiya',
      plan: 'premium', commissionPercent: 3, firstBranch: { name: 'Divulapitiya', city: 'Divulapitiya', district: 'Gampaha' }, expectedBranches: 6,
    }),
    tenant('tnt_cds', 2, 'Ceylon Daily Super', 'Ceylon Daily Retail (Pvt) Ltd', 'Colombo', 'active', '#2F6E8F', {
      ownerName: 'Ishara Wijesinghe', email: 'owner@ceylondaily.test', supportEmail: 'care@ceylondaily.test', hqAddress: 'No. 120, Ward Place, Colombo 07',
      firstBranch: { name: 'Colombo 07', city: 'Colombo', district: 'Colombo' }, expectedBranches: 4,
    }),
    tenant('tnt_rmm', 3, 'Ruhuna Mega Mart', 'Ruhuna Mega Mart (Pvt) Ltd', 'Matara', 'restricted', '#B9803F', {
      ownerName: 'Mahesh Gunawardena', email: 'owner@ruhunamega.test', supportEmail: 'info@ruhunamega.test', hqAddress: 'No. 8, Anagarika Dharmapala Mawatha, Matara',
      statusReason: 'Business registration certificate expired — upload the renewed certificate to lift the restriction.', statusChangedBy: 'Chamara Bandara',
      firstBranch: { name: 'Matara Town', city: 'Matara', district: 'Matara' },
    }),
    tenant('tnt_ivs', 4, 'Island Value Stores', 'Island Value Stores (Pvt) Ltd', 'Anuradhapura', 'pending', '#5E9E4A', {
      ownerName: 'Priyantha Rathnayake', email: 'owner@islandvalue.test', supportEmail: 'owner@islandvalue.test', hqAddress: 'No. 22, Maithripala Senanayake Mawatha, Anuradhapura',
      firstBranch: { name: 'Anuradhapura New Town', city: 'Anuradhapura', district: 'Anuradhapura' }, expectedBranches: 2, createdAt: iso(now - 3 * DAY), statusChangedAt: iso(now - 3 * DAY),
    }),
    tenant('tnt_nss', 5, 'Northern Star Super', 'Northern Star Traders', 'Jaffna', 'pending', '#3A74B8', {
      ownerName: 'Kumaran Sivakumar', email: 'owner@northernstar.test', supportEmail: 'owner@northernstar.test', hqAddress: 'No. 14, Hospital Road, Jaffna',
      firstBranch: { name: 'Jaffna Town', city: 'Jaffna', district: 'Jaffna' }, expectedBranches: 1, createdAt: iso(now - DAY), statusChangedAt: iso(now - DAY),
    }),
    tenant('tnt_qbd', 6, 'QuickBuy Discount', 'QuickBuy Holdings', 'Kurunegala', 'banned', '#B2504A', {
      ownerName: 'Roshan Fernando', email: 'owner@quickbuy.test', supportEmail: 'owner@quickbuy.test', hqAddress: 'No. 3, Puttalam Road, Kurunegala',
      statusReason: 'Repeated misleading-pricing complaints confirmed after investigation.', statusChangedBy: 'Chamara Bandara',
      firstBranch: { name: 'Kurunegala', city: 'Kurunegala', district: 'Kurunegala' },
    }),
    tenant('tnt_vg', 7, 'Valley Grocers', 'Valley Grocers', 'Badulla', 'rejected', '#5F7484', {
      ownerName: 'Ajith Senanayake', email: 'owner@valleygrocers.test', supportEmail: 'owner@valleygrocers.test', hqAddress: 'No. 5, Lower Street, Badulla',
      statusReason: 'Business registration number could not be verified with the Registrar of Companies.', statusChangedBy: 'Chamara Bandara',
      firstBranch: { name: 'Badulla', city: 'Badulla', district: 'Badulla' },
    }),
  ]

  // ------------------------------------------------------------------ branches
  const branch = (id: string, tenantId: string, name: string, code: string, district: string, city: string, address: string, status: Branch['status'] = 'open'): Branch => ({
    id, tenantId, name, code, district, city, address, status,
    phone: `+94 ${pick(['31', '33', '81', '91', '11', '37', '41', '47'])} ${200 + Math.floor(r() * 700)} ${1000 + Math.floor(r() * 8999)}`,
    openingHours: 'Daily 7:00 AM – 10:00 PM',
    deliveryRadiusKm: 8,
    createdAt: iso(now - Math.floor(60 + r() * 100) * DAY),
  })
  const branches: Branch[] = [
    branch('br_lfm_div', 'tnt_lfm', 'Divulapitiya', 'LFM-DIV', 'Gampaha', 'Divulapitiya', 'No. 45, Negombo Road, Divulapitiya'),
    branch('br_lfm_neg', 'tnt_lfm', 'Negombo', 'LFM-NEG', 'Gampaha', 'Negombo', 'No. 210, Main Street, Negombo'),
    branch('br_lfm_kdy', 'tnt_lfm', 'Kandy City', 'LFM-KDY', 'Kandy', 'Kandy', 'No. 18, Dalada Veediya, Kandy'),
    branch('br_lfm_gal', 'tnt_lfm', 'Galle', 'LFM-GAL', 'Galle', 'Galle', 'No. 77, Wakwella Road, Galle', 'temporarily_closed'),
    branch('br_cds_c07', 'tnt_cds', 'Colombo 07', 'CDS-C07', 'Colombo', 'Colombo', 'No. 120, Ward Place, Colombo 07'),
    branch('br_cds_mah', 'tnt_cds', 'Maharagama', 'CDS-MAH', 'Colombo', 'Maharagama', 'No. 64, High Level Road, Maharagama'),
    branch('br_cds_kur', 'tnt_cds', 'Kurunegala', 'CDS-KUR', 'Kurunegala', 'Kurunegala', 'No. 9, Colombo Road, Kurunegala'),
    branch('br_rmm_mat', 'tnt_rmm', 'Matara Town', 'RMM-MAT', 'Matara', 'Matara', 'No. 8, Anagarika Dharmapala Mawatha, Matara'),
    branch('br_rmm_ham', 'tnt_rmm', 'Hambantota', 'RMM-HAM', 'Hambantota', 'Hambantota', 'No. 31, Tissa Road, Hambantota'),
    branch('br_qbd_kur', 'tnt_qbd', 'Kurunegala', 'QBD-KUR', 'Kurunegala', 'Kurunegala', 'No. 3, Puttalam Road, Kurunegala', 'closed'),
  ]
  const branchesOf = (tid: string) => branches.filter((b) => b.tenantId === tid)

  // ------------------------------------------------------------------ roles
  const role = (id: string, name: string, description: string, permissions: Role['permissions'], scope: Role['scope'], tenantId: string | null, level: number, system: boolean, branchScoped = false): Role => ({
    id, name, description, permissions, scope, tenantId, level, system, branchScoped, createdAt: iso(now - 200 * DAY),
  })
  const roles: Role[] = [
    role(ROLE_IDS.superAdmin, 'Super Admin', 'Controls the whole HelaMart platform: supermarkets, their admins, customers and security.', [...PLATFORM_PERMISSIONS], 'platform', null, 100, true),
    role('role_platform_support', 'Platform Support', 'Helps supermarkets and customers; read-only access to supermarkets.', ['platform.dashboard', 'tenants.view', 'customers.all.view', 'platform.audit.view'], 'platform', null, 40, false),
    role(ROLE_IDS.chainAdmin, 'Chain Admin', 'Head of a supermarket chain. Runs every branch, team member, product and setting.', [...TENANT_PERMISSIONS], 'tenant', null, 80, true),
    role(ROLE_IDS.branchManager, 'Branch Manager', 'Head of one branch. Runs its orders, stock and officers.', [...BRANCH_MANAGER_PERMISSIONS], 'tenant', null, 60, true, true),
    role('role_lfm_cashier', 'Cashier', 'Handles checkout counter and online orders at a branch.', ['dashboard.view', 'orders.view', 'orders.manage', 'customers.view', 'tasks.view'], 'tenant', 'tnt_lfm', 20, false, true),
    role('role_lfm_stock', 'Stock Officer', 'Receives deliveries and keeps shelves stocked.', ['dashboard.view', 'products.view', 'inventory.manage', 'tasks.view'], 'tenant', 'tnt_lfm', 20, false, true),
    role('role_cds_supervisor', 'Floor Supervisor', 'Supervises the shop floor and stock across branches.', ['dashboard.view', 'orders.view', 'orders.manage', 'products.view', 'inventory.manage', 'tasks.view', 'tasks.manage', 'staff.view'], 'tenant', 'tnt_cds', 40, false),
  ]

  // ------------------------------------------------------------------ staff
  let colorIdx = 0
  const COLORS = ['#174D38', '#2F6E8F', '#9E3A5A', '#B9803F', '#5E9E4A', '#5F7484', '#3A74B8']
  const staffMember = (id: string, name: string, email: string, title: string, roleId: string, tenantId: string | null, branchIds: string[], password: string, extra: Partial<StaffUser> = {}): StaffUser => ({
    id, name, email, title, roleId, tenantId, branchIds,
    extraPermissions: [],
    status: 'active',
    mfaSecret: `${id}-totp-seed`,
    passwordHash: hashPassword(email, password),
    passwordChangedAt: iso(now - 20 * DAY),
    mustChangePassword: false,
    createdAt: iso(now - 150 * DAY),
    avatarColor: COLORS[colorIdx++ % COLORS.length]!,
    ...extra,
  })
  const P = SEED_PASSWORDS
  const staff: StaffUser[] = [
    staffMember('stf_super', 'Chamara Bandara', 'superadmin@helamart.test', 'HelaMart Platform Director', ROLE_IDS.superAdmin, null, [], P.superAdmin, { phone: '+94 77 100 2000' }),
    staffMember('stf_psupport', 'Nimesha Perera', 'support@helamart.test', 'Partner Support Lead', 'role_platform_support', null, [], P.staff, { createdBy: 'stf_super' }),

    staffMember('stf_lfm_owner', 'Sunil Wickramaratne', 'admin@lankafresh.test', 'Owner & Managing Director', ROLE_IDS.chainAdmin, 'tnt_lfm', [], P.chainAdmin, { createdBy: 'stf_super', phone: '+94 77 210 4455' }),
    staffMember('stf_lfm_div', 'Dinesh Kumara', 'divulapitiya@lankafresh.test', 'Branch Manager — Divulapitiya', ROLE_IDS.branchManager, 'tnt_lfm', ['br_lfm_div'], P.staff, { createdBy: 'stf_lfm_owner' }),
    staffMember('stf_lfm_neg', 'Anoma Silva', 'negombo@lankafresh.test', 'Branch Manager — Negombo', ROLE_IDS.branchManager, 'tnt_lfm', ['br_lfm_neg'], P.staff, { createdBy: 'stf_lfm_owner' }),
    staffMember('stf_lfm_kdy', 'Sajith Ekanayake', 'kandy@lankafresh.test', 'Branch Manager — Kandy City', ROLE_IDS.branchManager, 'tnt_lfm', ['br_lfm_kdy'], P.staff, { createdBy: 'stf_lfm_owner' }),
    staffMember('stf_lfm_cash', 'Thilini Ranasinghe', 'cashier.div@lankafresh.test', 'Cashier — Divulapitiya', 'role_lfm_cashier', 'tnt_lfm', ['br_lfm_div'], P.staff, { createdBy: 'stf_lfm_div' }),
    staffMember('stf_lfm_stock', 'Nadeesha Herath', 'stock.div@lankafresh.test', 'Stock Officer — Divulapitiya', 'role_lfm_stock', 'tnt_lfm', ['br_lfm_div'], P.staff, { createdBy: 'stf_lfm_div' }),
    staffMember('stf_lfm_former', 'Kasun Peris', 'kasun.p@lankafresh.test', 'Cashier (former) — Negombo', 'role_lfm_cashier', 'tnt_lfm', ['br_lfm_neg'], P.staff, { status: 'suspended', createdBy: 'stf_lfm_neg' }),

    staffMember('stf_cds_owner', 'Ishara Wijesinghe', 'admin@ceylondaily.test', 'Chief Executive', ROLE_IDS.chainAdmin, 'tnt_cds', [], P.chainAdmin, { createdBy: 'stf_super' }),
    staffMember('stf_cds_c07', 'Ravindu Jayasuriya', 'colombo7@ceylondaily.test', 'Branch Manager — Colombo 07', ROLE_IDS.branchManager, 'tnt_cds', ['br_cds_c07'], P.staff, { createdBy: 'stf_cds_owner' }),
    staffMember('stf_cds_sup', 'Hasini Gamage', 'supervisor@ceylondaily.test', 'Floor Supervisor', 'role_cds_supervisor', 'tnt_cds', [], P.staff, { createdBy: 'stf_cds_owner' }),

    staffMember('stf_rmm_owner', 'Mahesh Gunawardena', 'admin@ruhunamega.test', 'Proprietor', ROLE_IDS.chainAdmin, 'tnt_rmm', [], P.chainAdmin, { createdBy: 'stf_super' }),
    staffMember('stf_qbd_owner', 'Roshan Fernando', 'admin@quickbuy.test', 'Owner', ROLE_IDS.chainAdmin, 'tnt_qbd', [], P.chainAdmin, { createdBy: 'stf_super' }),
  ]
  for (const b of branches) b.managerId = staff.find((s) => s.roleId === ROLE_IDS.branchManager && s.branchIds.includes(b.id))?.id

  // ------------------------------------------------------------------ catalogue per supermarket
  const operating = tenants.filter((t) => branchesOf(t.id).length)
  const adminProducts: AdminProduct[] = []
  const adminCategories: AdminCategory[] = []
  for (const t of operating) {
    for (const c of categories) adminCategories.push({ id: c.id, tenantId: t.id, name: c.name, description: c.description, color: c.color, visible: true })
    for (const prod of products) {
      if (t.id !== 'tnt_lfm' && r() < 0.15) continue // smaller chains stock a subset
      const factor = t.id === 'tnt_lfm' ? 1 : 0.94 + r() * 0.12
      const stock: Record<string, number> = {}
      for (const b of branchesOf(t.id)) {
        const roll = r()
        stock[b.id] = roll < 0.07 ? 0 : roll < 0.18 ? 2 + Math.floor(r() * 10) : 20 + Math.floor(r() * 120)
      }
      adminProducts.push({ ...prod, tenantId: t.id, priceCents: Math.round((prod.priceCents * factor) / 500) * 500 || prod.priceCents, stock, reorderLevel: 12, status: 'active', updatedAt: iso(now - Math.floor(r() * 30) * DAY) })
    }
  }

  // ------------------------------------------------------------------ customers (all of Sri Lanka)
  const FIRST = ['Sahan', 'Nethmi', 'Kalum', 'Dilini', 'Pradeep', 'Ayesha', 'Ruwan', 'Hasini', 'Lahiru', 'Sanduni', 'Tharindu', 'Malsha', 'Isuru', 'Gayani', 'Janith', 'Piumi', 'Kavinda', 'Ishani', 'Chathura', 'Rashmi', 'Mohamed', 'Fathima', 'Arun', 'Priya', 'Nuwan', 'Sachini', 'Dulaj', 'Kaveesha', 'Rizwan', 'Tharushi']
  const LAST = ['Perera', 'Fernando', 'Silva', 'Jayawardena', 'Gunasekara', 'Rajapaksha', 'Wickramasinghe', 'Dissanayake', 'Herath', 'Bandara', 'Karunaratne', 'Samarasinghe', 'Rizvi', 'Sivarajah', 'Nadarajah']
  const activeTenantIds = ['tnt_lfm', 'tnt_cds', 'tnt_rmm', 'tnt_qbd']
  const homeDistrictTenants: Record<string, string[]> = { Gampaha: ['tnt_lfm'], Kandy: ['tnt_lfm'], Galle: ['tnt_lfm'], Colombo: ['tnt_cds', 'tnt_lfm'], Kurunegala: ['tnt_cds', 'tnt_qbd'], Matara: ['tnt_rmm'], Hambantota: ['tnt_rmm'] }
  const customers: Customer[] = [
    ...mockAccounts.map((a, i) => ({
      id: a.user.id, name: a.user.name, email: a.user.email, phone: a.user.phone, provider: a.user.provider,
      status: 'active' as const, createdAt: iso(now - (160 - i * 10) * DAY), district: i % 2 ? 'Colombo' : 'Gampaha', city: i % 2 ? 'Colombo' : 'Divulapitiya',
      tenantIds: ['tnt_lfm', ...(i % 2 ? ['tnt_cds'] : [])], blockedByTenants: [], ordersCount: 0, totalSpentCents: 0,
    })),
  ]
  for (let i = 0; i < 70; i++) {
    const first = FIRST[i % FIRST.length]!
    const last = LAST[(i * 7) % LAST.length]!
    const district = i < 45 ? pick(['Gampaha', 'Colombo', 'Kandy', 'Galle', 'Kurunegala', 'Matara', 'Hambantota']) : pick(DISTRICTS)
    const home = homeDistrictTenants[district] ?? [pick(activeTenantIds)]
    const tenantIds = [...new Set([...home, ...(r() < 0.25 ? [pick(['tnt_lfm', 'tnt_cds'])] : [])])]
    customers.push({
      id: `cus_${i + 1}`,
      name: `${first} ${last}`,
      email: `${first}.${last}${i}@example.lk`.toLowerCase(),
      phone: `+94 7${Math.floor(r() * 9)} ${100 + Math.floor(r() * 899)} ${1000 + Math.floor(r() * 8999)}`,
      provider: r() < 0.35 ? 'google' : 'password',
      status: i === 19 ? 'blocked' : 'active',
      createdAt: iso(now - Math.floor(2 + r() * 170) * DAY),
      district,
      city: district,
      tenantIds,
      blockedByTenants: i === 31 ? ['tnt_lfm'] : [],
      ordersCount: 0,
      totalSpentCents: 0,
    })
  }

  // ------------------------------------------------------------------ orders
  const orders: AdminOrder[] = []
  const VOLUME: Record<string, number> = { tnt_lfm: 90, tnt_cds: 55, tnt_rmm: 18, tnt_qbd: 8 }
  let seq = 9000
  for (const [tid, count] of Object.entries(VOLUME)) {
    const tBranches = branchesOf(tid)
    const members = customers.filter((c) => c.tenantIds.includes(tid))
    const catalogue = adminProducts.filter((p) => p.tenantId === tid)
    const maxAge = tid === 'tnt_qbd' ? 60 : 30
    for (let i = 0; i < count; i++) {
      const ageDays = (tid === 'tnt_qbd' ? 30 : 0) + Math.pow(r(), 1.4) * (maxAge - (tid === 'tnt_qbd' ? 30 : 0))
      const created = now - ageDays * DAY - Math.floor(r() * 8) * 3600e3
      const cust = pick(members)
      const br = pick(tBranches)
      const lines: CartLine[] = []
      for (let l = 0, n = 1 + Math.floor(r() * 5); l < n; l++) {
        const prod = pick(catalogue)
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
      if (status !== 'pending') history.push({ at: iso(created + 2 * 3600e3), status, by: 'Branch team' })
      orders.push({
        id: `ord_${tid}_${i + 1}`,
        number: `HM-2026-${seq++}`,
        tenantId: tid,
        branchId: br.id,
        createdAt: iso(created),
        customerId: cust.id,
        customerName: cust.name,
        customerEmail: cust.email,
        lines: breakdown.lines.map((ln) => ({ ...ln, name: getProduct(ln.productId)!.name, size: getProduct(ln.productId)!.size })),
        breakdown,
        delivery: {
          method: pickup ? 'pickup' : 'delivery', fullName: cust.name, phone: cust.phone ?? '+94 77 000 0000',
          address: pickup ? '' : `No. ${1 + Math.floor(r() * 220)}, ${pick(['Main Street', 'Temple Road', 'Station Road', 'Lake Drive', 'School Lane'])}`,
          city: br.city, slot: pick(['Today, 4:00–6:00 PM', 'Tomorrow, 9:00–11:00 AM', 'Tomorrow, 2:00–4:00 PM']), notes: '',
        },
        payment: { method: card ? 'card' : 'cod', cardLast4: card ? String(1000 + Math.floor(r() * 8999)) : undefined, status: status === 'refunded' ? 'refunded' : card ? 'paid' : 'pay-on-delivery' },
        status,
        history,
        source: 'sample',
      })
    }
  }
  orders.sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  // ------------------------------------------------------------------ promotions
  const offers: AdminOffer[] = []
  for (const acc of mockAccounts) {
    for (const o of acc.offers) {
      const existing = offers.find((x) => x.id === o.id)
      if (existing) existing.customerIds.push(acc.user.id)
      else offers.push({ ...o, tenantId: 'tnt_lfm', branchIds: [], status: 'active', audience: 'selected', customerIds: [acc.user.id], usageCount: Math.floor(r() * 40), createdAt: iso(now - 60 * DAY) })
    }
  }
  offers.push(
    { id: 'off_lfm_new', code: 'HELLOHELA', title: 'New customer: Rs. 250 off', description: 'Rs. 250 off your order of Rs. 1,500 or more.', rule: { kind: 'fixed-off', amountCents: 25000, minSpendCents: 150000 }, expiresAt: '2027-12-31T23:59:59+05:30', tenantId: 'tnt_lfm', branchIds: [], status: 'active', audience: 'new', customerIds: [], usageCount: 87, createdAt: iso(now - 90 * DAY) },
    { id: 'off_lfm_div', code: 'DIVU10', title: 'Divulapitiya opening week: 10% off produce', description: 'Fresh produce 10% off at our Divulapitiya branch.', rule: { kind: 'percent-category', categoryId: 'produce', percent: 10 }, expiresAt: '2027-01-31T23:59:59+05:30', tenantId: 'tnt_lfm', branchIds: ['br_lfm_div'], status: 'active', audience: 'all', customerIds: [], usageCount: 23, createdAt: iso(now - 10 * DAY) },
    { id: 'off_cds_staples', code: 'CDSRICE5', title: '5% off rice & staples', description: 'Weekend staples discount.', rule: { kind: 'percent-category', categoryId: 'staples', percent: 5 }, expiresAt: '2027-03-31T23:59:59+05:30', tenantId: 'tnt_cds', branchIds: [], status: 'active', audience: 'all', customerIds: [], usageCount: 41, createdAt: iso(now - 30 * DAY) },
  )

  // ------------------------------------------------------------------ tasks
  const task = (id: string, tenantId: string | null, branchId: string | undefined, title: string, description: string, assigneeId: string, createdById: string, priority: StaffTask['priority'], status: StaffTask['status'], dueInDays: number): StaffTask => ({
    id, tenantId, branchId, title, description, assigneeId, createdById, priority, status,
    dueDate: new Date(now + dueInDays * DAY).toISOString().slice(0, 10), createdAt: iso(now - 3 * DAY), updatedAt: iso(now - DAY), comments: [],
  })
  const tasks: StaffTask[] = [
    task('tsk_p1', null, undefined, 'Verify Island Value Stores documents', 'Check the BR certificate and owner NIC, then recommend approval or rejection.', 'stf_psupport', 'stf_super', 'high', 'in_progress', 1),
    task('tsk_p2', null, undefined, 'Follow up Ruhuna Mega Mart renewal', 'Ask for the renewed business registration certificate so the restriction can be lifted.', 'stf_psupport', 'stf_super', 'medium', 'todo', 5),
    task('tsk_1', 'tnt_lfm', 'br_lfm_div', 'Restock Keeri Samba rice', 'Shelf in Aisle 1 is nearly empty. Receive the Polonnaruwa Mills delivery.', 'stf_lfm_stock', 'stf_lfm_div', 'high', 'todo', 1),
    task('tsk_2', 'tnt_lfm', undefined, 'Plan Avurudu promotions', 'Draft April seasonal offers for all branches.', 'stf_lfm_div', 'stf_lfm_owner', 'medium', 'in_progress', 10),
    task('tsk_3', 'tnt_lfm', 'br_lfm_div', 'Call customer about late delivery', 'Confirm the new delivery slot with the customer.', 'stf_lfm_cash', 'stf_lfm_div', 'urgent', 'todo', 0),
    task('tsk_4', 'tnt_lfm', 'br_lfm_neg', 'Weekly chiller temperature check', 'Log dairy and frozen cabinet temperatures.', 'stf_lfm_neg', 'stf_lfm_owner', 'medium', 'done', -1),
    task('tsk_5', 'tnt_cds', 'br_cds_c07', 'Prepare Colombo 07 stock count', 'Full stock count before month end.', 'stf_cds_c07', 'stf_cds_owner', 'high', 'todo', 3),
  ]

  // ------------------------------------------------------------------ audit + settings
  const a = (id: string, days: number, tenantId: string | null, actorId: string, actorName: string, action: string, target: string, details: string, severity: AuditEntry['severity'] = 'info'): AuditEntry => ({ id, at: iso(now - days * DAY), tenantId, actorId, actorName, action, target, details, severity })
  const audit: AuditEntry[] = [
    a('aud_s1', 40, null, 'stf_super', 'Chamara Bandara', 'tenant.approve', 'Lanka Fresh Mart', 'Documents verified; chain admin account created', 'warning'),
    a('aud_s2', 25, null, 'stf_super', 'Chamara Bandara', 'tenant.ban', 'QuickBuy Discount', 'Repeated misleading-pricing complaints', 'critical'),
    a('aud_s3', 12, null, 'stf_super', 'Chamara Bandara', 'tenant.restrict', 'Ruhuna Mega Mart', 'BR certificate expired', 'warning'),
    a('aud_s4', 9, 'tnt_lfm', 'stf_lfm_owner', 'Sunil Wickramaratne', 'branch.update', 'Galle', 'Temporarily closed for renovation', 'warning'),
    a('aud_s5', 2, 'tnt_lfm', 'stf_lfm_div', 'Dinesh Kumara', 'inventory.adjust', 'Sandwich Bread', '12 → 60 (+48) · Delivery received'),
  ]

  const settings: PlatformSettings = {
    platformName: 'HelaMart',
    supportEmail: 'partners@helamart.test',
    supportHotline: '+94 11 200 3000',
    applicationsOpen: true,
    defaultCommissionPercent: 3.5,
    security: { sessionIdleMinutes: 15, sessionMaxHours: 8, maxLoginAttempts: 5, lockoutMinutes: 5, passwordMinLength: 12, passwordExpiryDays: 90, require2fa: true },
  }

  return { tenants, branches, roles, staff, products: adminProducts, categories: adminCategories, customers, orders, offers, tasks, audit, settings }
}
