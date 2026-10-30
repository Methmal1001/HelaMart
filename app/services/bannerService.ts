import type { Offer, ShopperLocation } from '~/types'
import type { BrandingProfile, PlatformBanner } from '~/types/admin'
import { DISTRICTS } from '~/data/sriLanka'
import { sniffImageType } from '~/utils/imageProcessing'
import { isOfferActive } from '~/utils/pricing'
import { offerHeadline } from '~/utils/offerText'
import { branchServes } from '~/lib/area'
import { ApiError } from './apiError'
import { latency, randomId } from './mock/server'
import { putMedia } from './mock/mediaStore'
import { readAdminDb, writeAdminDb } from './admin/db'
import { audit, authenticate, requirePermission, requirePlatform, requireStepUp, sanitize } from './admin/security'
import { nowIso, run } from './admin/common'
import { listLocalStores } from './partnerService'

/**
 * HelaMart homepage banners. Only HelaMart head office (platform.banners.manage)
 * can create them; they can feature a supermarket and one of its offers, and
 * are shown to shoppers by area: everyone, chosen districts, or only where the
 * featured supermarket actually delivers.
 */

export const BANNER_THEMES: PlatformBanner['theme'][] = ['green', 'gold', 'sunset', 'ocean', 'berry']

// ================================================================== head office

export function listBanners(token: string): Promise<PlatformBanner[]> {
  return run(token, (ctx) => {
    requirePlatform(ctx)
    requirePermission(ctx, 'platform.banners.manage')
    return [...ctx.db.banners].sort((a, b) => b.priority - a.priority || b.createdAt.localeCompare(a.createdAt))
  })
}

export type BannerInput = Omit<PlatformBanner, 'id' | 'views' | 'clicks' | 'createdAt' | 'createdBy' | 'status'>

export function saveBanner(token: string, input: BannerInput, id?: string): Promise<PlatformBanner> {
  return run(token, (ctx) => {
    requirePlatform(ctx)
    requirePermission(ctx, 'platform.banners.manage')
    const title = sanitize(input.title, 70)
    if (title.length < 3) throw new ApiError(422, 'Enter a headline.')
    const subtitle = sanitize(input.subtitle, 140)
    if (!BANNER_THEMES.includes(input.theme)) throw new ApiError(422, 'Choose a colour theme.')
    if (!['shop', 'offers', 'none'].includes(input.cta)) throw new ApiError(422, 'Choose what the button does.')
    if (!['all', 'districts', 'deliverable'].includes(input.target)) throw new ApiError(422, 'Choose who sees the banner.')
    const districts = input.target === 'districts' ? [...new Set(input.districts)].filter((d) => (DISTRICTS as readonly string[]).includes(d)) : []
    if (input.target === 'districts' && !districts.length) throw new ApiError(422, 'Choose at least one district.')
    const tenant = input.tenantId ? ctx.db.tenants.find((t) => t.id === input.tenantId) : undefined
    if (input.tenantId && (!tenant || tenant.status !== 'active')) throw new ApiError(422, 'Feature an active, verified supermarket.')
    if ((input.target === 'deliverable' || input.cta !== 'none') && !tenant) throw new ApiError(422, 'Choose the supermarket this banner promotes.')
    if (input.offerId) {
      const o = ctx.db.offers.find((x) => x.id === input.offerId && x.tenantId === input.tenantId)
      if (!o) throw new ApiError(422, 'That offer doesn’t belong to the chosen supermarket.')
    }
    const startsAt = Date.parse(input.startsAt)
    const endsAt = Date.parse(input.endsAt)
    if (Number.isNaN(startsAt) || Number.isNaN(endsAt) || endsAt <= startsAt) throw new ApiError(422, 'The banner must end after it starts.')
    if (input.image) {
      const mid = /^media:([a-f0-9]{8,64})$/.exec(input.image)?.[1]
      const rec = mid && ctx.db.media.find((m) => m.id === mid)
      if (!rec || rec.tenantId !== 'platform') throw new ApiError(422, 'Upload the banner image again.')
    }
    const priority = Math.max(0, Math.min(100, Math.round(Number(input.priority) || 0)))
    const fields = {
      title, subtitle, image: input.image || undefined, theme: input.theme, tenantId: tenant?.id, offerId: tenant ? input.offerId || undefined : undefined,
      cta: input.cta, target: input.target, districts, startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString(), priority,
    }
    if (id) {
      const b = ctx.db.banners.find((x) => x.id === id)
      if (!b) throw new ApiError(404, 'Banner not found.')
      Object.assign(b, fields)
      audit(ctx.db, ctx, 'banner.update', b.title, `${b.target}${tenant ? ` · ${tenant.name}` : ''}`, 'info', null)
      return b
    }
    const b: PlatformBanner = { ...fields, id: `bnr_${randomId(5)}`, status: 'active', views: 0, clicks: 0, createdAt: nowIso(), createdBy: ctx.staff.name }
    ctx.db.banners.push(b)
    audit(ctx.db, ctx, 'banner.create', b.title, `${b.target}${tenant ? ` · ${tenant.name}` : ''}`, 'info', null)
    return b
  })
}

export function setBannerStatus(token: string, id: string, status: PlatformBanner['status']): Promise<PlatformBanner> {
  return run(token, (ctx) => {
    requirePlatform(ctx)
    requirePermission(ctx, 'platform.banners.manage')
    const b = ctx.db.banners.find((x) => x.id === id)
    if (!b) throw new ApiError(404, 'Banner not found.')
    b.status = status
    audit(ctx.db, ctx, status === 'active' ? 'banner.resume' : 'banner.pause', b.title, undefined, 'info', null)
    return b
  })
}

export function deleteBanner(token: string, id: string): Promise<void> {
  return run(token, (ctx) => {
    requirePlatform(ctx)
    requirePermission(ctx, 'platform.banners.manage')
    requireStepUp(ctx)
    const b = ctx.db.banners.find((x) => x.id === id)
    if (!b) throw new ApiError(404, 'Banner not found.')
    ctx.db.banners = ctx.db.banners.filter((x) => x !== b)
    audit(ctx.db, ctx, 'banner.delete', b.title, undefined, 'warning', null)
  })
}

/** A supermarket's running offers, to feature one on a banner. */
export function offersForBanner(token: string, tenantId: string): Promise<{ id: string; code: string; title: string; headline: string; rule: Offer['rule']; branches: string }[]> {
  return run(token, (ctx) => {
    requirePlatform(ctx)
    requirePermission(ctx, 'platform.banners.manage')
    return ctx.db.offers
      .filter((o) => o.tenantId === tenantId && o.status === 'active' && isOfferActive(o) && o.audience !== 'selected')
      .map((o) => ({ id: o.id, code: o.code, title: o.title, headline: offerHeadline(o.rule), rule: o.rule, branches: o.branchIds.length ? o.branchIds.map((b) => ctx.db.branches.find((x) => x.id === b)?.name ?? b).join(', ') : 'All branches' }))
  })
}

/** Head-office banner image (3:1). Checked by file signature, stored as HelaMart media. */
export async function uploadBannerImage(token: string, blob: Blob, size: { width: number; height: number }): Promise<string> {
  await latency(250, 600)
  const ctx = authenticate(token)
  requirePlatform(ctx)
  requirePermission(ctx, 'platform.banners.manage')
  if (blob.size > 2 * 1024 * 1024) throw new ApiError(413, 'The processed image is too large (max 2 MB).')
  const kind = await sniffImageType(blob)
  if (!kind) throw new ApiError(415, 'Only JPG, PNG or WebP images are accepted.')
  const id = randomId(12)
  await putMedia(id, blob)
  const db = readAdminDb()
  db.media.push({ id, tenantId: 'platform', uploadedBy: ctx.staff.id, bytes: blob.size, type: `image/${kind}`, width: size.width, height: size.height, createdAt: nowIso(), purpose: 'banner' })
  audit(db, ctx, 'media.upload', 'Homepage banner image', `${Math.round(blob.size / 1024)} KB`, 'info', null)
  writeAdminDb(db)
  return `media:${id}`
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

/** The banners for a shopper's area, best first. Without an area only "everyone" banners show. */
export function bannersFor(area: ShopperLocation | null, now = Date.now()): PublicBanner[] {
  const db = readAdminDb()
  const stores = listLocalStores()
  const out: (PublicBanner & { priority: number })[] = []
  for (const b of db.banners) {
    if (b.status !== 'active' || Date.parse(b.startsAt) > now || Date.parse(b.endsAt) <= now) continue
    const store = b.tenantId ? stores.find((s) => s.id === b.tenantId) : undefined
    if (b.tenantId && !store) continue // featured supermarket no longer listed
    if (b.target === 'districts' && !(area && b.districts.includes(area.district))) continue
    // The branch that would serve this shopper (needed for "deliverable" banners and the Shop button).
    const serving = store && area ? store.branches.filter((x) => branchServes(x, area)).sort((x, y) => Math.hypot(x.lat - area.lat, x.lng - area.lng) - Math.hypot(y.lat - area.lat, y.lng - area.lng))[0] : undefined
    if (b.target === 'deliverable' && !serving) continue
    const o = b.offerId ? db.offers.find((x) => x.id === b.offerId && x.status === 'active' && isOfferActive(x, now)) : undefined
    const offerAtBranch = o && (!serving || !o.branchIds.length || o.branchIds.includes(serving.id)) ? o : undefined
    out.push({
      id: b.id, title: b.title, subtitle: b.subtitle, image: b.image, theme: b.theme, cta: b.cta, priority: b.priority,
      store: store ? { id: store.id, name: store.name, branding: store.branding, brandColor: store.brandColor, branchId: serving?.id, branchName: serving?.name } : undefined,
      offer: offerAtBranch ? { id: offerAtBranch.id, code: offerAtBranch.code, title: offerAtBranch.title, description: offerAtBranch.description, rule: offerAtBranch.rule, expiresAt: offerAtBranch.expiresAt, conditions: offerAtBranch.conditions, storeId: store?.id, storeName: store?.name } : undefined,
    })
  }
  return out.sort((a, b) => b.priority - a.priority).map(({ priority: _p, ...rest }) => rest)
}

/** GET /home/banners?lat=&lng= — public. */
export async function listHomeBanners(area: ShopperLocation | null): Promise<PublicBanner[]> {
  await latency(60, 160)
  return bannersFor(area)
}

/** POST /home/banners/:id/events — simple view / click counts for head office. */
export function recordBannerEvent(id: string, kind: 'view' | 'click') {
  try {
    const db = readAdminDb()
    const b = db.banners.find((x) => x.id === id)
    if (!b) return
    if (kind === 'view') b.views++
    else b.clicks++
    writeAdminDb(db)
  } catch {
    /* analytics must never break the page */
  }
}
