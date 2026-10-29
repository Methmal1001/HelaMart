import type { BrandingProfile, TenantDocument, TenantStatus } from '~/types/admin'
import { api } from './http'

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
  return api<{ reference: string }>('/partners/applications', { method: 'POST', body: input })
}

/** Status lookup needs both the reference and the email used — no enumeration of applicants. */
export function applicationStatus(reference: string, email: string): Promise<{ name: string; reference: string; status: TenantStatus; reason?: string; submittedAt: string }> {
  return api('/partners/applications/status', { query: { reference, email } })
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

/** GET /stores — only approved, active supermarkets. Restricted or banned ones disappear. */
export function listStores(): Promise<PublicStore[]> {
  return api<PublicStore[]>('/stores')
}
