import type { BrandingProfile, BrandingRequest, Tenant } from '~/types/admin'
import { ApiError } from '../apiError'
import { randomId } from '../mock/server'
import type { MediaRecord } from './db'
import { audit, requirePermission, requirePlatform, requireStepUp, requireTenant, requireWritable, sanitize, type AdminContext } from './security'
import { nowIso, run } from './common'
import { storeUpload } from './tenantApi'
import {
  HEX_RE,
  MAX_PROMO_BANNERS,
  SLOGAN_MAX,
  WELCOME_MAX,
  describeChanges,
  liveBranding,
  premiumItemsUsed,
  stripPremium,
} from '~/lib/branding'

/**
 * Supermarket branding with HelaMart approval.
 *
 * A chain admin edits a DRAFT and submits it as a request; nothing reaches
 * shoppers until a HelaMart reviewer approves it. Plan limits are enforced
 * here (not just in the UI): Standard = logo, 1 banner, theme colour, slogan;
 * Premium adds the rest.
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
  return run(token, (ctx) => {
    requirePermission(ctx, 'settings.manage')
    const t = requireTenant(ctx)
    const mine = ctx.db.brandingRequests.filter((r) => r.tenantId === t.id).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
    const approved = mine.find((r) => r.status === 'approved')
    return {
      plan: t.plan,
      supermarketName: t.name,
      live: liveBranding(t),
      liveSince: approved?.reviewedAt,
      pending: mine.find((r) => r.status === 'pending') ?? null,
      lastDecision: mine.find((r) => r.status === 'approved' || r.status === 'rejected') ?? null,
      readOnly: t.status !== 'active',
    }
  })
}

/** Logo / banner upload (stored, but unused until a request containing it is approved). */
export function uploadBrandImage(token: string, blob: Blob, size: { width: number; height: number }, kind: 'logo' | 'banner'): Promise<string> {
  return storeUpload(token, 'settings.manage', blob, size, kind)
}

function mediaOk(ctx: AdminContext, tenantId: string, ref: string | undefined, purpose: MediaRecord['purpose']) {
  if (!ref) return
  const id = /^media:([a-f0-9]{8,64})$/.exec(ref)?.[1]
  const rec = id && ctx.db.media.find((m) => m.id === id)
  if (!rec || rec.tenantId !== tenantId || rec.purpose !== purpose) throw new ApiError(422, `Upload the ${purpose} again — that image isn’t available.`)
}

function clean(input: BrandingProfile): BrandingProfile {
  const primaryColor = String(input.primaryColor ?? '').trim()
  const accentColor = input.accentColor ? String(input.accentColor).trim() : undefined
  if (!HEX_RE.test(primaryColor)) throw new ApiError(422, 'Pick a valid theme colour.')
  if (accentColor && !HEX_RE.test(accentColor)) throw new ApiError(422, 'Pick a valid accent colour.')
  const slogan = sanitize(input.slogan ?? '', SLOGAN_MAX)
  const welcomeMessage = sanitize(input.welcomeMessage ?? '', WELCOME_MAX) || undefined
  const promoBanners = Array.isArray(input.promoBanners) ? input.promoBanners.filter(Boolean) : []
  if (promoBanners.length > MAX_PROMO_BANNERS) throw new ApiError(422, `Up to ${MAX_PROMO_BANNERS} promotional banners.`)
  if (new Set(promoBanners).size !== promoBanners.length) throw new ApiError(422, 'The same banner is used twice.')
  return {
    logo: input.logo || undefined,
    banner: input.banner || undefined,
    primaryColor: primaryColor.toLowerCase(),
    slogan,
    accentColor: accentColor?.toLowerCase(),
    promoBanners,
    welcomeMessage,
    logoOnFixtures: !!input.logoOnFixtures,
  }
}

export function submitBrandingRequest(token: string, input: BrandingProfile): Promise<BrandingRequest> {
  return run(token, (ctx) => {
    requirePermission(ctx, 'settings.manage')
    requireStepUp(ctx)
    const t = requireWritable(ctx)
    const profile = clean(input)
    // Plan limits are enforced on the server, not only greyed out in the form.
    const premium = premiumItemsUsed(profile)
    if (t.plan !== 'premium' && premium.length) {
      throw new ApiError(403, `These need the Premium plan: ${premium.join(', ')}. Remove them or ask HelaMart to upgrade your plan.`)
    }
    mediaOk(ctx, t.id, profile.logo, 'logo')
    mediaOk(ctx, t.id, profile.banner, 'banner')
    profile.promoBanners.forEach((b) => mediaOk(ctx, t.id, b, 'banner'))

    const changes = describeChanges(liveBranding(t), profile)
    if (!changes.length) throw new ApiError(409, 'Nothing has changed from your live branding.')

    // One request in review at a time: a new one replaces the previous.
    for (const r of ctx.db.brandingRequests) {
      if (r.tenantId === t.id && r.status === 'pending') Object.assign(r, { status: 'withdrawn', reviewNote: 'Replaced by a newer request.', reviewedAt: nowIso(), reviewedBy: ctx.staff.name })
    }
    const req: BrandingRequest = {
      id: `brq_${randomId(6)}`,
      tenantId: t.id,
      profile,
      changes,
      status: 'pending',
      submittedById: ctx.staff.id,
      submittedBy: ctx.staff.name,
      submittedAt: nowIso(),
    }
    ctx.db.brandingRequests.push(req)
    audit(ctx.db, ctx, 'branding.submit', t.name, changes.join(' · '))
    return req
  })
}

export function withdrawBrandingRequest(token: string, id: string): Promise<void> {
  return run(token, (ctx) => {
    requirePermission(ctx, 'settings.manage')
    const t = requireTenant(ctx)
    const r = ctx.db.brandingRequests.find((x) => x.id === id && x.tenantId === t.id)
    if (!r) throw new ApiError(404, 'Request not found.')
    if (r.status !== 'pending') throw new ApiError(409, 'Only requests waiting for review can be withdrawn.')
    Object.assign(r, { status: 'withdrawn', reviewedAt: nowIso(), reviewedBy: ctx.staff.name })
    audit(ctx.db, ctx, 'branding.withdraw', t.name, 'Branding request withdrawn')
  })
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
  return run(token, (ctx) => {
    requirePlatform(ctx)
    requirePermission(ctx, 'tenants.view')
    const rank = (s: BrandingRequest['status']) => (s === 'pending' ? 0 : 1)
    return ctx.db.brandingRequests
      .map((r) => {
        const t = ctx.db.tenants.find((x) => x.id === r.tenantId)!
        return { ...r, supermarketName: t.name, plan: t.plan, tenantStatus: t.status, current: liveBranding(t) }
      })
      .sort((a, b) => rank(a.status) - rank(b.status) || b.submittedAt.localeCompare(a.submittedAt))
  })
}

export function reviewBrandingRequest(token: string, id: string, decision: 'approve' | 'reject', note = ''): Promise<BrandingRequest> {
  return run(token, (ctx) => {
    requirePlatform(ctx)
    requirePermission(ctx, 'tenants.review')
    requireStepUp(ctx)
    const r = ctx.db.brandingRequests.find((x) => x.id === id)
    if (!r) throw new ApiError(404, 'Request not found.')
    if (r.status !== 'pending') throw new ApiError(409, 'This request has already been decided.')
    const t = ctx.db.tenants.find((x) => x.id === r.tenantId)!
    const reason = sanitize(note, 300)

    if (decision === 'reject') {
      if (reason.length < 5) throw new ApiError(422, 'Tell the supermarket why (at least 5 characters).')
      Object.assign(r, { status: 'rejected', reviewNote: reason, reviewedAt: nowIso(), reviewedBy: ctx.staff.name })
      audit(ctx.db, ctx, 'branding.reject', t.name, reason, 'warning', t.id)
      return r
    }

    if (t.status !== 'active') throw new ApiError(409, `${t.name} is ${t.status}; branding can only be published for active supermarkets.`)
    // If the plan was downgraded after submitting, premium items are not published.
    const dropped = t.plan === 'premium' ? [] : premiumItemsUsed(r.profile)
    t.branding = dropped.length ? stripPremium(r.profile) : { ...r.profile }
    t.brandColor = r.profile.primaryColor
    const extra = dropped.length ? ` Not published (Standard plan): ${dropped.join(', ')}.` : ''
    Object.assign(r, { status: 'approved', reviewNote: (reason + extra).trim() || undefined, reviewedAt: nowIso(), reviewedBy: ctx.staff.name })
    audit(ctx.db, ctx, 'branding.approve', t.name, r.changes.join(' · ') + extra, 'info', t.id)
    return r
  })
}
