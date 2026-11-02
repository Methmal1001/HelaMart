import type { Offer, ShopperLocation } from '~/types'
import type { BrandingProfile, PlatformBanner } from '~/types/admin'
import { offerHeadline } from '~/utils/offerText'
import { api } from './http'
import { apiGet as get, apiSend as send, encodeId as id } from './admin/common'
import { storeUpload } from './admin/tenantApi'

/**
 * HelaMart homepage banners (HelaMart backend). Only HelaMart head office (platform.banners.manage)
 * can create them; they can feature a supermarket and one of its offers, and are shown to shoppers
 * by area: everyone, chosen districts, or only where the featured supermarket actually delivers.
 */

export const BANNER_THEMES: PlatformBanner['theme'][] = ['green', 'gold', 'sunset', 'ocean', 'berry']

// ================================================================== head office

export function listBanners(token: string): Promise<PlatformBanner[]> {
  return get(token, '/admin/platform/banners')
}

export type BannerInput = Omit<PlatformBanner, 'id' | 'views' | 'clicks' | 'createdAt' | 'createdBy' | 'status'>

export function saveBanner(token: string, input: BannerInput, bannerId?: string): Promise<PlatformBanner> {
  return bannerId ? send(token, 'PUT', `/admin/platform/banners/${id(bannerId)}`, input) : send(token, 'POST', '/admin/platform/banners', input)
}

export function setBannerStatus(token: string, bannerId: string, status: PlatformBanner['status']): Promise<PlatformBanner> {
  return send(token, 'PUT', `/admin/platform/banners/${id(bannerId)}/status`, { status })
}

export async function deleteBanner(token: string, bannerId: string): Promise<void> {
  await send(token, 'DELETE', `/admin/platform/banners/${id(bannerId)}`)
}

/** A supermarket's running offers, to feature one on a banner. */
export async function offersForBanner(token: string, tenantId: string): Promise<{ id: string; code: string; title: string; headline: string; rule: Offer['rule']; branches: string }[]> {
  const list = await get<{ id: string; code: string; title: string; headline: string; rule: Offer['rule']; branches: string }[]>(token, '/admin/platform/banners/offers', { tenantId })
  return list.map((o) => ({ ...o, headline: offerHeadline(o.rule) }))
}

/** Head-office banner image (3:1). Checked by file signature, stored as HelaMart media. */
export function uploadBannerImage(token: string, blob: Blob, size: { width: number; height: number }): Promise<string> {
  return storeUpload(token, blob, size, 'banner')
}

// ================================================================== shoppers

export interface PublicBanner {
  id: string
  title: string
  subtitle: string
  image?: string
  theme: PlatformBanner['theme']
  cta: PlatformBanner['cta']
  store?: { id: string; name: string; branding: BrandingProfile; brandColor: string; branchId?: string; branchName?: string }
  offer?: Offer
}

/** GET /home/banners?lat=&lng=&label=&district= — public. Without an area only "everyone" banners show. */
export function listHomeBanners(area: ShopperLocation | null): Promise<PublicBanner[]> {
  return api<PublicBanner[]>('/home/banners', { query: area ? { lat: area.lat, lng: area.lng, label: area.label, district: area.district } : {} })
}

/** POST /home/banners/:id/events — simple view / click counts for head office. */
export function recordBannerEvent(bannerId: string, kind: 'view' | 'click') {
  // Analytics must never break the page.
  void api<void>(`/home/banners/${id(bannerId)}/events`, { method: 'POST', body: { kind } }).catch(() => undefined)
}
