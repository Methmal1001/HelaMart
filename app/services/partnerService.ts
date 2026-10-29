import type { BrandingProfile, Tenant, TenantDocument } from '~/types/admin'
import { DISTRICTS, isValidBrNumber, isValidNic } from '~/data/sriLanka'
import { EMAIL_RE, isSriLankanMobile } from '~/utils/validation'
import { ApiError } from './apiError'
import { latency, randomId } from './mock/server'
import { readAdminDb, writeAdminDb } from './admin/db'
import { audit, sanitize } from './admin/security'
import { liveBranding } from '~/lib/branding'
import { locateBranch } from '~/data/places'

const pick = (p: { lat: number; lng: number }) => ({ lat: p.lat, lng: p.lng })

/**
 * Public partner endpoints (no sign-in):
 *   POST /partners/applications · GET /partners/applications/status · GET /stores
 */

export interface ApplicationInput {
  name: string
  legalName: string
  brNumber: string
  vatNumber: string
  ownerName: string
  ownerNic: string
  email: string
  phone: string
  hqAddress: string
  district: string
  firstBranchName: string
  firstBranchCity: string
  expectedBranches: number
  documents: { kind: TenantDocument['kind']; fileName: string; sizeKb: number }[]
  declaration: boolean
}

const MAX_PER_HOUR = 3
const ALLOWED_FILE = /\.(pdf|jpe?g|png)$/i

export async function submitApplication(input: ApplicationInput): Promise<{ reference: string }> {
  await latency(600, 1000)
  const db = readAdminDb()
  if (!db.settings.applicationsOpen) throw new ApiError(503, 'HelaMart is not accepting new supermarket applications right now.')
  if (db.applicationLog.filter((t) => Date.now() - t < 3600e3).length >= MAX_PER_HOUR) throw new ApiError(429, 'Too many applications from this device. Try again in an hour.', 'RATE_LIMITED')

  const err = (m: string) => {
    throw new ApiError(422, m)
  }
  if (sanitize(input.name, 60).length < 3) err('Enter the supermarket name.')
  if (sanitize(input.legalName, 100).length < 3) err('Enter the registered business name.')
  if (!isValidBrNumber(input.brNumber)) err('Enter a valid business registration number (e.g. PV 00123456).')
  if (sanitize(input.ownerName, 80).length < 3) err('Enter the owner’s full name.')
  if (!isValidNic(input.ownerNic)) err('Enter a valid NIC number (e.g. 199012345678 or 901234567V).')
  if (!EMAIL_RE.test(input.email.trim())) err('Enter a valid email address.')
  if (!isSriLankanMobile(input.phone)) err('Enter a Sri Lankan mobile number.')
  if (sanitize(input.hqAddress, 200).length < 8) err('Enter the head-office address.')
  if (!(DISTRICTS as readonly string[]).includes(input.district)) err('Choose a district.')
  if (sanitize(input.firstBranchName, 60).length < 2 || sanitize(input.firstBranchCity, 60).length < 2) err('Enter your first branch’s name and town.')
  if (!(input.expectedBranches >= 1 && input.expectedBranches <= 500)) err('Number of branches must be between 1 and 500.')
  for (const kind of ['br_certificate', 'owner_nic'] as const) {
    const d = input.documents.find((x) => x.kind === kind)
    if (!d) err(kind === 'br_certificate' ? 'Attach the business registration certificate.' : 'Attach a copy of the owner’s NIC.')
  }
  for (const d of input.documents) {
    if (!ALLOWED_FILE.test(d.fileName)) err('Documents must be PDF, JPG or PNG files.')
    if (d.sizeKb > 5 * 1024) err('Each document must be 5 MB or smaller.')
  }
  if (!input.declaration) err('Please confirm the declaration.')

  const br = input.brNumber.trim().toUpperCase().replace(/\s+/g, ' ')
  if (db.tenants.some((t) => t.brNumber.replace(/\s+/g, '') === br.replace(/\s+/g, '') && t.status !== 'rejected')) {
    throw new ApiError(409, 'A supermarket with this business registration number is already registered or under review.', 'DUPLICATE')
  }

  const seq = db.tenants.length + 1
  const tenant: Tenant = {
    id: `tnt_${randomId(5)}`,
    reference: `HMA-${new Date().getFullYear()}-${String(seq).padStart(4, '0')}${randomId(1).toUpperCase()}`,
    name: sanitize(input.name, 60),
    legalName: sanitize(input.legalName, 100),
    brNumber: br,
    vatNumber: sanitize(input.vatNumber, 30) || undefined,
    ownerName: sanitize(input.ownerName, 80),
    ownerNic: input.ownerNic.trim().toUpperCase(),
    email: input.email.trim().toLowerCase(),
    phone: input.phone.trim(),
    hqAddress: sanitize(input.hqAddress, 200),
    district: input.district,
    brandColor: '#174D38',
    plan: 'standard',
    commissionPercent: db.settings.defaultCommissionPercent,
    status: 'pending',
    statusChangedAt: new Date().toISOString(),
    documents: input.documents.map((d) => ({ ...d, fileName: sanitize(d.fileName, 120), verified: false })),
    firstBranch: { name: sanitize(input.firstBranchName, 60), city: sanitize(input.firstBranchCity, 60), district: input.district },
    expectedBranches: Math.floor(input.expectedBranches),
    createdAt: new Date().toISOString(),
    hotline: input.phone.trim(),
    supportEmail: input.email.trim().toLowerCase(),
    defaultHours: 'Daily 8:00 AM – 9:00 PM',
    deliveryFeeCents: 35000,
    minOrderCents: 100000,
  }
  db.tenants.push(tenant)
  db.applicationLog.push(Date.now())
  audit(db, { staff: null, name: `${tenant.ownerName} (applicant)` }, 'tenant.apply', tenant.name, `${tenant.reference} · ${tenant.district}`, 'info', tenant.id)
  writeAdminDb(db)
  return { reference: tenant.reference }
}

/** Status lookup needs both the reference and the email used — no enumeration of applicants. */
export async function applicationStatus(reference: string, email: string) {
  await latency(300, 600)
  const t = readAdminDb().tenants.find((x) => x.reference.toUpperCase() === reference.trim().toUpperCase() && x.email === email.trim().toLowerCase())
  if (!t) throw new ApiError(404, 'No application matches that reference and email.')
  return { name: t.name, reference: t.reference, status: t.status, reason: t.status === 'rejected' || t.status === 'restricted' || t.status === 'banned' ? t.statusReason : undefined, submittedAt: t.createdAt }
}

export interface PublicStore {
  id: string
  name: string
  brandColor: string
  /** HelaMart-approved branding, limited to the supermarket's current plan. */
  branding: BrandingProfile
  branches: PublicBranch[]
}

export interface PublicBranch {
  id: string
  name: string
  city: string
  district: string
  status: 'open' | 'temporarily_closed'
  hours: string
  lat: number
  lng: number
  deliveryRadiusKm: number
}

/** Only approved, active supermarkets are visible to shoppers. Restricted or banned ones disappear. */
export function listStores(): PublicStore[] {
  const db = readAdminDb()
  return db.tenants
    .filter((t) => t.status === 'active')
    .map((t) => ({
      id: t.id,
      name: t.name,
      brandColor: t.brandColor,
      branding: liveBranding(t),
      branches: db.branches
        .filter((b) => b.tenantId === t.id && b.status !== 'closed')
        .map((b) => ({ id: b.id, name: b.name, city: b.city, district: b.district, status: b.status as 'open' | 'temporarily_closed', hours: b.openingHours, ...pick(locateBranch(b)), deliveryRadiusKm: b.deliveryRadiusKm })),
    }))
    .filter((s) => s.branches.length)
}
