import type {
  BrandingRequest,
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
import { masterProducts as products } from '~/data/products'
import { categories } from '~/data/categories'
import { mockAccounts } from '~/data/mockUsers'
import { DISTRICTS } from '~/data/sriLanka'
import { priceCart } from '~/utils/pricing'
import { locateBranch } from '~/data/places'
import { circlePolygon, polygonAreaKm2 } from '~/lib/geo'
import { townsInside } from '~/lib/coverage'
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
  const masterById = new Map(products.map((p) => [p.id, p]))
  const getProduct = (id: string) => masterById.get(id)
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
      branding: {
        primaryColor: '#1F7A4D', slogan: 'Fresh from Lanka, every day', accentColor: '#F2B33D', promoBanners: [],
        welcomeMessage: 'Ayubowan! Fresh produce arrives every morning — enjoy your shopping.', logoOnFixtures: true,
      },
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
    // Verified chains around the island, so shoppers anywhere find stores near them.
    tenant('tnt_wfm', 8, 'Western Family Mart', 'Western Family Mart (Pvt) Ltd', 'Gampaha', 'active', '#B03A48', {
      ownerName: 'Dilan Rajapaksha', email: 'owner@westernfamily.test', supportEmail: 'help@westernfamily.test', hqAddress: 'No. 12, Bauddhaloka Mawatha, Gampaha', plan: 'standard',
      firstBranch: { name: 'Gampaha Town', city: 'Gampaha', district: 'Gampaha' }, expectedBranches: 4,
      createdAt: iso(now - 228 * DAY), approvedAt: iso(now - 208 * DAY), statusChangedAt: iso(now - 208 * DAY),
      branding: { primaryColor: '#b03a48', slogan: 'Family prices, every day', promoBanners: [], logoOnFixtures: false },
    }),
    tenant('tnt_hcf', 9, 'Hill Country Fresh', 'Hill Country Fresh (Pvt) Ltd', 'Kandy', 'active', '#3D6B35', {
      ownerName: 'Nirosha Kumari', email: 'owner@hillcountry.test', supportEmail: 'help@hillcountry.test', hqAddress: 'No. 4, Colombo Road, Peradeniya', plan: 'premium',
      firstBranch: { name: 'Peradeniya', city: 'Peradeniya', district: 'Kandy' }, expectedBranches: 4,
      createdAt: iso(now - 219 * DAY), approvedAt: iso(now - 199 * DAY), statusChangedAt: iso(now - 199 * DAY),
      branding: { primaryColor: '#3d6b35', slogan: 'Fresh from the hills', promoBanners: [], logoOnFixtures: false },
    }),
    tenant('tnt_shm', 10, 'Southern Harvest Mart', 'Southern Harvest (Pvt) Ltd', 'Galle', 'active', '#C2571A', {
      ownerName: 'Thushara Liyanage', email: 'owner@southernharvest.test', supportEmail: 'help@southernharvest.test', hqAddress: 'No. 33, Matara Road, Galle', plan: 'standard',
      firstBranch: { name: 'Galle', city: 'Galle', district: 'Galle' }, expectedBranches: 4,
      createdAt: iso(now - 210 * DAY), approvedAt: iso(now - 190 * DAY), statusChangedAt: iso(now - 190 * DAY),
      branding: { primaryColor: '#c2571a', slogan: 'The taste of the south coast', promoBanners: [], logoOnFixtures: false },
    }),
    tenant('tnt_rjs', 11, 'Rajarata Super', 'Rajarata Super Stores', 'Anuradhapura', 'active', '#7A4B9A', {
      ownerName: 'Sampath Ekanayake', email: 'owner@rajarata.test', supportEmail: 'help@rajarata.test', hqAddress: 'No. 18, Maithripala Senanayake Mawatha, Anuradhapura', plan: 'standard',
      firstBranch: { name: 'Anuradhapura', city: 'Anuradhapura', district: 'Anuradhapura' }, expectedBranches: 4,
      createdAt: iso(now - 201 * DAY), approvedAt: iso(now - 181 * DAY), statusChangedAt: iso(now - 181 * DAY),
      branding: { primaryColor: '#7a4b9a', slogan: 'Serving the heart of the island', promoBanners: [], logoOnFixtures: false },
    }),
    tenant('tnt_ebs', 12, 'East Bay Super', 'East Bay Super (Pvt) Ltd', 'Trincomalee', 'active', '#1F7F8C', {
      ownerName: 'Mohamed Rizwan', email: 'owner@eastbay.test', supportEmail: 'help@eastbay.test', hqAddress: 'No. 44, Main Street, Trincomalee', plan: 'standard',
      firstBranch: { name: 'Trincomalee', city: 'Trincomalee', district: 'Trincomalee' }, expectedBranches: 3,
      createdAt: iso(now - 192 * DAY), approvedAt: iso(now - 172 * DAY), statusChangedAt: iso(now - 172 * DAY),
      branding: { primaryColor: '#1f7f8c', slogan: 'From the bay to your basket', promoBanners: [], logoOnFixtures: false },
    }),
    tenant('tnt_yfm', 13, 'Yarl Fresh Mart', 'Yarl Fresh Traders', 'Jaffna', 'active', '#C9962B', {
      ownerName: 'Kumaran Thevarajah', email: 'owner@yarlfresh.test', supportEmail: 'help@yarlfresh.test', hqAddress: 'No. 25, Hospital Road, Jaffna', plan: 'standard',
      firstBranch: { name: 'Jaffna Town', city: 'Jaffna', district: 'Jaffna' }, expectedBranches: 4,
      createdAt: iso(now - 183 * DAY), approvedAt: iso(now - 163 * DAY), statusChangedAt: iso(now - 163 * DAY),
      branding: { primaryColor: '#c9962b', slogan: 'Jaffna’s own supermarket', promoBanners: [], logoOnFixtures: false },
    }),
    tenant('tnt_cgr', 14, 'Coastline Grocers', 'Coastline Grocers (Pvt) Ltd', 'Kalutara', 'active', '#2E5E9E', {
      ownerName: 'Shehan De Silva', email: 'owner@coastline.test', supportEmail: 'help@coastline.test', hqAddress: 'No. 15, Galle Road, Panadura', plan: 'premium',
      firstBranch: { name: 'Panadura', city: 'Panadura', district: 'Kalutara' }, expectedBranches: 4,
      createdAt: iso(now - 174 * DAY), approvedAt: iso(now - 154 * DAY), statusChangedAt: iso(now - 154 * DAY),
      branding: { primaryColor: '#2e5e9e', slogan: 'Good food by the sea', promoBanners: [], logoOnFixtures: false },
    }),
    tenant('tnt_sbf', 15, 'Sabara Fresh', 'Sabara Fresh Stores', 'Ratnapura', 'active', '#5E8B2A', {
      ownerName: 'Chaminda Abeysekara', email: 'owner@sabarafresh.test', supportEmail: 'help@sabarafresh.test', hqAddress: 'No. 40, Main Street, Ratnapura', plan: 'standard',
      firstBranch: { name: 'Ratnapura', city: 'Ratnapura', district: 'Ratnapura' }, expectedBranches: 4,
      createdAt: iso(now - 165 * DAY), approvedAt: iso(now - 145 * DAY), statusChangedAt: iso(now - 145 * DAY),
      branding: { primaryColor: '#5e8b2a', slogan: 'Gem of a grocery', promoBanners: [], logoOnFixtures: false },
    }),
    tenant('tnt_uvs', 16, 'Uva Valley Stores', 'Uva Valley Stores', 'Badulla', 'active', '#9C4F2E', {
      ownerName: 'Lalith Herath', email: 'owner@uvavalley.test', supportEmail: 'help@uvavalley.test', hqAddress: 'No. 27, Lower Street, Badulla', plan: 'standard',
      firstBranch: { name: 'Badulla', city: 'Badulla', district: 'Badulla' }, expectedBranches: 3,
      createdAt: iso(now - 156 * DAY), approvedAt: iso(now - 136 * DAY), statusChangedAt: iso(now - 136 * DAY),
      branding: { primaryColor: '#9c4f2e', slogan: 'Hill-country fresh, valley prices', promoBanners: [], logoOnFixtures: false },
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
  // Deterministic (no random draws), so adding chains doesn't reshuffle the rest of the sample data.
  const fixedBranch = (id: string, tenantId: string, name: string, code: string, district: string, city: string, address: string, ageDays: number): Branch => ({
    id, tenantId, name, code, district, city, address, status: 'open',
    phone: `+94 ${String(20 + (ageDays % 70)).padStart(2, '0')} ${220 + ageDays * 7} ${3100 + ageDays * 37}`,
    openingHours: 'Daily 7:30 AM – 9:30 PM',
    deliveryRadiusKm: ageDays % 2 ? 10 : 6,
    createdAt: iso(now - ageDays * DAY),
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
    fixedBranch('br_wfm_gam', 'tnt_wfm', 'Gampaha Town', 'WFM-GAM', 'Gampaha', 'Gampaha', 'No. 12, Bauddhaloka Mawatha, Gampaha', 40),
    fixedBranch('br_wfm_jae', 'tnt_wfm', 'Ja-Ela', 'WFM-JAE', 'Gampaha', 'Ja-Ela', 'No. 88, Negombo Road, Ja-Ela', 43),
    fixedBranch('br_wfm_kdw', 'tnt_wfm', 'Kadawatha', 'WFM-KDW', 'Gampaha', 'Kadawatha', 'No. 301, Kandy Road, Kadawatha', 46),
    fixedBranch('br_wfm_wat', 'tnt_wfm', 'Wattala', 'WFM-WAT', 'Gampaha', 'Wattala', 'No. 56, Negombo Road, Wattala', 49),
    fixedBranch('br_hcf_per', 'tnt_hcf', 'Peradeniya', 'HCF-PER', 'Kandy', 'Peradeniya', 'No. 4, Colombo Road, Peradeniya', 47),
    fixedBranch('br_hcf_nue', 'tnt_hcf', 'Nuwara Eliya', 'HCF-NUE', 'Nuwara Eliya', 'Nuwara Eliya', 'No. 21, Lawson Street, Nuwara Eliya', 50),
    fixedBranch('br_hcf_gmp', 'tnt_hcf', 'Gampola', 'HCF-GMP', 'Kandy', 'Gampola', 'No. 9, Nuwara Eliya Road, Gampola', 53),
    fixedBranch('br_hcf_mtl', 'tnt_hcf', 'Matale', 'HCF-MTL', 'Matale', 'Matale', 'No. 140, Main Street, Matale', 56),
    fixedBranch('br_shm_gal', 'tnt_shm', 'Galle', 'SHM-GAL', 'Galle', 'Galle', 'No. 33, Matara Road, Galle', 54),
    fixedBranch('br_shm_hik', 'tnt_shm', 'Hikkaduwa', 'SHM-HIK', 'Galle', 'Hikkaduwa', 'No. 210, Galle Road, Hikkaduwa', 57),
    fixedBranch('br_shm_amb', 'tnt_shm', 'Ambalangoda', 'SHM-AMB', 'Galle', 'Ambalangoda', 'No. 7, Main Street, Ambalangoda', 60),
    fixedBranch('br_shm_mat', 'tnt_shm', 'Matara', 'SHM-MAT', 'Matara', 'Matara', 'No. 52, Anagarika Dharmapala Mawatha, Matara', 63),
    fixedBranch('br_rjs_anu', 'tnt_rjs', 'Anuradhapura', 'RS-ANU', 'Anuradhapura', 'Anuradhapura', 'No. 18, Maithripala Senanayake Mawatha, Anuradhapura', 61),
    fixedBranch('br_rjs_pol', 'tnt_rjs', 'Polonnaruwa', 'RS-POL', 'Polonnaruwa', 'Polonnaruwa', 'No. 5, Batticaloa Road, Polonnaruwa', 64),
    fixedBranch('br_rjs_kek', 'tnt_rjs', 'Kekirawa', 'RS-KEK', 'Anuradhapura', 'Kekirawa', 'No. 61, Dambulla Road, Kekirawa', 67),
    fixedBranch('br_rjs_dam', 'tnt_rjs', 'Dambulla', 'RS-DAM', 'Matale', 'Dambulla', 'No. 3, Kandy Road, Dambulla', 70),
    fixedBranch('br_ebs_tri', 'tnt_ebs', 'Trincomalee', 'EBS-TRI', 'Trincomalee', 'Trincomalee', 'No. 44, Main Street, Trincomalee', 68),
    fixedBranch('br_ebs_bat', 'tnt_ebs', 'Batticaloa', 'EBS-BAT', 'Batticaloa', 'Batticaloa', 'No. 12, Trinco Road, Batticaloa', 71),
    fixedBranch('br_ebs_kal', 'tnt_ebs', 'Kalmunai', 'EBS-KAL', 'Ampara', 'Kalmunai', 'No. 90, Main Street, Kalmunai', 74),
    fixedBranch('br_yfm_jaf', 'tnt_yfm', 'Jaffna Town', 'YFM-JAF', 'Jaffna', 'Jaffna', 'No. 25, Hospital Road, Jaffna', 75),
    fixedBranch('br_yfm_cha', 'tnt_yfm', 'Chavakachcheri', 'YFM-CHA', 'Jaffna', 'Chavakachcheri', 'No. 8, Kandy Road, Chavakachcheri', 78),
    fixedBranch('br_yfm_vav', 'tnt_yfm', 'Vavuniya', 'YFM-VAV', 'Vavuniya', 'Vavuniya', 'No. 66, Station Road, Vavuniya', 81),
    fixedBranch('br_yfm_kil', 'tnt_yfm', 'Kilinochchi', 'YFM-KIL', 'Kilinochchi', 'Kilinochchi', 'No. 2, A9 Road, Kilinochchi', 84),
    fixedBranch('br_cgr_pan', 'tnt_cgr', 'Panadura', 'CG-PAN', 'Kalutara', 'Panadura', 'No. 15, Galle Road, Panadura', 82),
    fixedBranch('br_cgr_klt', 'tnt_cgr', 'Kalutara', 'CG-KLT', 'Kalutara', 'Kalutara', 'No. 101, Main Street, Kalutara', 85),
    fixedBranch('br_cgr_mor', 'tnt_cgr', 'Moratuwa', 'CG-MOR', 'Colombo', 'Moratuwa', 'No. 230, Galle Road, Moratuwa', 88),
    fixedBranch('br_cgr_hor', 'tnt_cgr', 'Horana', 'CG-HOR', 'Kalutara', 'Horana', 'No. 19, Ratnapura Road, Horana', 91),
    fixedBranch('br_sbf_rat', 'tnt_sbf', 'Ratnapura', 'SF-RAT', 'Ratnapura', 'Ratnapura', 'No. 40, Main Street, Ratnapura', 89),
    fixedBranch('br_sbf_keg', 'tnt_sbf', 'Kegalle', 'SF-KEG', 'Kegalle', 'Kegalle', 'No. 11, Kandy Road, Kegalle', 92),
    fixedBranch('br_sbf_bal', 'tnt_sbf', 'Balangoda', 'SF-BAL', 'Ratnapura', 'Balangoda', 'No. 6, Bandarawela Road, Balangoda', 95),
    fixedBranch('br_sbf_avi', 'tnt_sbf', 'Avissawella', 'SF-AVI', 'Colombo', 'Avissawella', 'No. 72, Ratnapura Road, Avissawella', 98),
    fixedBranch('br_uvs_bad', 'tnt_uvs', 'Badulla', 'UVS-BAD', 'Badulla', 'Badulla', 'No. 27, Lower Street, Badulla', 96),
    fixedBranch('br_uvs_bdw', 'tnt_uvs', 'Bandarawela', 'UVS-BDW', 'Badulla', 'Bandarawela', 'No. 14, Welimada Road, Bandarawela', 99),
    fixedBranch('br_uvs_mon', 'tnt_uvs', 'Monaragala', 'UVS-MON', 'Monaragala', 'Monaragala', 'No. 5, Wellawaya Road, Monaragala', 102),
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
    staffMember('stf_wfm_owner', 'Dilan Rajapaksha', 'admin@westernfamily.test', 'Owner', ROLE_IDS.chainAdmin, 'tnt_wfm', [], P.chainAdmin, { createdBy: 'stf_super' }),
    staffMember('stf_hcf_owner', 'Nirosha Kumari', 'admin@hillcountry.test', 'Owner', ROLE_IDS.chainAdmin, 'tnt_hcf', [], P.chainAdmin, { createdBy: 'stf_super' }),
    staffMember('stf_shm_owner', 'Thushara Liyanage', 'admin@southernharvest.test', 'Owner', ROLE_IDS.chainAdmin, 'tnt_shm', [], P.chainAdmin, { createdBy: 'stf_super' }),
    staffMember('stf_rjs_owner', 'Sampath Ekanayake', 'admin@rajarata.test', 'Owner', ROLE_IDS.chainAdmin, 'tnt_rjs', [], P.chainAdmin, { createdBy: 'stf_super' }),
    staffMember('stf_ebs_owner', 'Mohamed Rizwan', 'admin@eastbay.test', 'Owner', ROLE_IDS.chainAdmin, 'tnt_ebs', [], P.chainAdmin, { createdBy: 'stf_super' }),
    staffMember('stf_yfm_owner', 'Kumaran Thevarajah', 'admin@yarlfresh.test', 'Owner', ROLE_IDS.chainAdmin, 'tnt_yfm', [], P.chainAdmin, { createdBy: 'stf_super' }),
    staffMember('stf_cgr_owner', 'Shehan De Silva', 'admin@coastline.test', 'Owner', ROLE_IDS.chainAdmin, 'tnt_cgr', [], P.chainAdmin, { createdBy: 'stf_super' }),
    staffMember('stf_sbf_owner', 'Chaminda Abeysekara', 'admin@sabarafresh.test', 'Owner', ROLE_IDS.chainAdmin, 'tnt_sbf', [], P.chainAdmin, { createdBy: 'stf_super' }),
    staffMember('stf_uvs_owner', 'Lalith Herath', 'admin@uvavalley.test', 'Owner', ROLE_IDS.chainAdmin, 'tnt_uvs', [], P.chainAdmin, { createdBy: 'stf_super' }),
  ]
  for (const b of branches) b.managerId = staff.find((s) => s.roleId === ROLE_IDS.branchManager && s.branchIds.includes(b.id))?.id

  // Every sample branch gets a pin and a drawn delivery area (slightly irregular, like a real hand-drawn one).
  for (const b of branches) {
    const pin = locateBranch(b)
    b.lat = pin.lat
    b.lng = pin.lng
    const polygon = circlePolygon(pin.lat, pin.lng, b.deliveryRadiusKm, 14, 0.14)
    b.coverage = {
      polygon,
      places: [...new Set([b.city, ...townsInside(polygon)])],
      areaKm2: Math.round(polygonAreaKm2(polygon)),
      updatedAt: b.createdAt,
      updatedBy: 'Sample data',
    }
  }

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

  // ------------------------------------------------------------------ branding approvals
  const brandingRequests: BrandingRequest[] = [
    {
      id: 'brq_cds_1',
      tenantId: 'tnt_cds',
      profile: { primaryColor: '#1E5F8C', slogan: 'Your daily needs, done right', promoBanners: [], logoOnFixtures: false },
      changes: ['Theme colour #2F6E8F → #1E5F8C', 'Slogan “Your daily needs, done right”'],
      status: 'pending',
      submittedById: 'stf_cds_owner',
      submittedBy: 'Ishara Wijesinghe',
      submittedAt: iso(now - 5 * 3600e3),
    },
  ]

  return { tenants, branches, roles, staff, products: adminProducts, categories: adminCategories, customers, orders, offers, tasks, audit, settings, brandingRequests }
}
