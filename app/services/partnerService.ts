import type { BrandingProfile, TenantDocument, TenantStatus } from '~/types/admin'
import { api } from './http'
import type { ApplicationReceiptDto, ApplicationRequest, ApplicationStatusDto, PublicBranchDto, PublicStoreDto } from './apiTypes'
import { circlePolygon } from '~/lib/geo'
import { townsInside } from '~/lib/coverage'

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

/** POST /partners/applications — validated (and rate limited) again on the server. */
export function submitApplication(input: ApplicationInput): Promise<{ reference: string }> {
  const body: ApplicationRequest = { ...input, vatNumber: input.vatNumber.trim() || undefined }
  return api<ApplicationReceiptDto>('/partners/applications', { method: 'POST', body })
}

/** Status lookup needs both the reference and the email used — no enumeration of applicants. */
export type ApplicationStatus = ApplicationStatusDto & { status: TenantStatus }

export function applicationStatus(reference: string, email: string): Promise<ApplicationStatus> {
  return api<ApplicationStatus>('/partners/applications/status', { query: { reference, email } })
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
  /** Where this branch delivers (map area + named places). */
  coverage: { polygon: [number, number][]; places: string[] }
  /** False = pickup only: the supermarket doesn't deliver from this branch; customers collect at the store. */
  deliveryEnabled: boolean
  /** Where to collect orders. */
  address?: string
  phone?: string
}

/** GET /stores — only approved, active supermarkets. Restricted or banned ones disappear. */
export async function listStores(): Promise<PublicStore[]> {
  return (await api<PublicStoreDto[]>('/stores')).map(fromStoreDto).filter((s) => s.branches.length)
}

/**
 * The API's store → the storefront's. Each branch carries the delivery area its
 * supermarket drew (polygon + named places); shoppers are matched against it.
 */
function fromStoreDto(s: PublicStoreDto): PublicStore {
  const primary = s.branding?.primaryColor || s.brandColor
  return {
    id: s.id,
    name: s.name,
    brandColor: s.brandColor,
    branding: {
      logo: s.branding?.logo,
      banner: s.branding?.banner,
      primaryColor: primary,
      slogan: s.branding?.slogan ?? '',
      accentColor: s.branding?.accentColor,
      promoBanners: s.branding?.promoBanners ?? [],
      welcomeMessage: s.branding?.welcomeMessage,
      logoOnFixtures: !!s.branding?.logoOnFixtures,
    },
    branches: s.branches.filter((b) => b.status !== 'closed' && Number.isFinite(b.lat) && Number.isFinite(b.lng)).map(fromBranchDto),
  }
}
function fromBranchDto(b: PublicBranchDto): PublicBranch {
  return {
    id: b.id, name: b.name, city: b.city, district: b.district,
    status: b.status === 'open' ? 'open' : 'temporarily_closed',
    hours: b.hours, lat: b.lat, lng: b.lng, deliveryRadiusKm: b.deliveryRadiusKm,
    coverage: coverageOf(b),
    deliveryEnabled: b.deliveryEnabled !== false,
    address: b.address,
    phone: b.phone,
  }
}

/** The branch's drawn delivery area; a circle of its delivery radius only if the API sent none. */
function coverageOf(b: PublicBranchDto): PublicBranch['coverage'] {
  const drawn = b.coverage?.polygon?.filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])) ?? []
  if (drawn.length >= 3) return { polygon: drawn, places: b.coverage?.places?.length ? b.coverage.places : [b.city] }
  const polygon = circlePolygon(b.lat, b.lng, Math.max(1, b.deliveryRadiusKm), 24)
  return { polygon, places: [...new Set([b.city, ...townsInside(polygon)])] }
}
