import type { BrandingProfile, BrandingRequest, Tenant } from '~/types/admin'
import { apiGet as get, apiSend as send, encodeId as id } from './common'
import { storeUpload } from './tenantApi'

/**
 * Supermarket branding with HelaMart approval (HelaMart backend).
 *
 * A chain admin edits a DRAFT and submits it as a request; nothing reaches
 * shoppers until a HelaMart reviewer approves it. Plan limits are enforced
 * on the server (not just in the UI): Standard = logo, 1 banner, theme colour,
 * slogan; Premium adds the rest.
 */

// ================================================================== supermarket side

export interface BrandingState {
  plan: Tenant['plan']
  supermarketName: string
  /** What shoppers see right now. */
  live: BrandingProfile
  liveSince?: string
  pending: BrandingRequest | null
  /** Most recent decided request (to show approval / rejection reason). */
  lastDecision: BrandingRequest | null
  readOnly: boolean
}

export function getBranding(token: string): Promise<BrandingState> {
  return get(token, '/admin/store/branding')
}

/** Logo / banner upload (stored, but unused until a request containing it is approved). */
export function uploadBrandImage(token: string, blob: Blob, size: { width: number; height: number }, kind: 'logo' | 'banner'): Promise<string> {
  return storeUpload(token, blob, size, kind)
}

export function submitBrandingRequest(token: string, input: BrandingProfile): Promise<BrandingRequest> {
  return send(token, 'POST', '/admin/store/branding/requests', input)
}

export async function withdrawBrandingRequest(token: string, requestId: string): Promise<void> {
  await send(token, 'POST', `/admin/store/branding/requests/${id(requestId)}/withdraw`)
}

// ================================================================== HelaMart side

export interface BrandingReviewItem extends BrandingRequest {
  supermarketName: string
  plan: Tenant['plan']
  tenantStatus: Tenant['status']
  /** Live branding at the time of review (for side-by-side comparison). */
  current: BrandingProfile
}

export function listBrandingRequests(token: string): Promise<BrandingReviewItem[]> {
  return get(token, '/admin/platform/branding-requests')
}

export function reviewBrandingRequest(token: string, requestId: string, decision: 'approve' | 'reject', note = ''): Promise<BrandingRequest> {
  return send(token, 'POST', `/admin/platform/branding-requests/${id(requestId)}/review`, { decision, note })
}
