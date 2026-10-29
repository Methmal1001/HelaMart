import type { BrandingProfile, Tenant } from '~/types/admin'

/**
 * Supermarket branding rules shared by the admin API, the admin screens and
 * the shopper side, so plan limits and "what's live" are decided in one place.
 *
 *  Standard plan: 1 logo, 1 banner, main theme colour, slogan.
 *  Premium plan:  + accent colour, up to 3 promo banners, welcome message,
 *                 logo on every aisle end-cap.
 */

export const MAX_PROMO_BANNERS = 3
export const SLOGAN_MAX = 80
export const WELCOME_MAX = 160

export const PREMIUM_FEATURES = [
  { key: 'accentColor', label: 'Second (accent) theme colour' },
  { key: 'promoBanners', label: `Up to ${MAX_PROMO_BANNERS} extra promotional wall banners` },
  { key: 'welcomeMessage', label: 'Welcome message for shoppers' },
  { key: 'logoOnFixtures', label: 'Your logo on every aisle end-cap' },
] as const

export const HEX_RE = /^#[0-9a-f]{6}$/i

/** What a tenant shows before any branding has been approved. */
export function baseBranding(t: Pick<Tenant, 'brandColor'>): BrandingProfile {
  return { primaryColor: t.brandColor, slogan: '', promoBanners: [], logoOnFixtures: false }
}

/** Premium-only items a profile uses. */
export function premiumItemsUsed(p: BrandingProfile): string[] {
  const used: string[] = []
  if (p.accentColor) used.push(PREMIUM_FEATURES[0].label)
  if (p.promoBanners.length) used.push(PREMIUM_FEATURES[1].label)
  if (p.welcomeMessage?.trim()) used.push(PREMIUM_FEATURES[2].label)
  if (p.logoOnFixtures) used.push(PREMIUM_FEATURES[3].label)
  return used
}

/** Drop premium items (e.g. after a downgrade to Standard). */
export function stripPremium(p: BrandingProfile): BrandingProfile {
  return { logo: p.logo, banner: p.banner, primaryColor: p.primaryColor, slogan: p.slogan, promoBanners: [], logoOnFixtures: false }
}

/** The branding shoppers actually see: approved profile, limited to the current plan. */
export function liveBranding(t: Pick<Tenant, 'brandColor' | 'plan' | 'branding'>): BrandingProfile {
  const p = t.branding ?? baseBranding(t)
  return t.plan === 'premium' ? p : stripPremium(p)
}

/** Plain-language list of differences, shown to the reviewer and in the audit log. */
export function describeChanges(from: BrandingProfile, to: BrandingProfile): string[] {
  const out: string[] = []
  const img = (a: string | undefined, b: string | undefined, label: string) => {
    if (a === b) return
    out.push(!b ? `Remove ${label}` : !a ? `Add ${label}` : `Replace ${label}`)
  }
  img(from.logo, to.logo, 'logo')
  img(from.banner, to.banner, 'main banner')
  if (from.primaryColor.toLowerCase() !== to.primaryColor.toLowerCase()) out.push(`Theme colour ${from.primaryColor.toUpperCase()} → ${to.primaryColor.toUpperCase()}`)
  if (from.slogan !== to.slogan) out.push(to.slogan ? `Slogan “${to.slogan}”` : 'Remove slogan')
  if ((from.accentColor ?? '').toLowerCase() !== (to.accentColor ?? '').toLowerCase()) out.push(to.accentColor ? `Accent colour ${to.accentColor.toUpperCase()}` : 'Remove accent colour')
  if (from.promoBanners.join() !== to.promoBanners.join()) out.push(`Promotional banners: ${to.promoBanners.length}`)
  if ((from.welcomeMessage ?? '') !== (to.welcomeMessage ?? '')) out.push(to.welcomeMessage ? `Welcome message “${to.welcomeMessage}”` : 'Remove welcome message')
  if (from.logoOnFixtures !== to.logoOnFixtures) out.push(to.logoOnFixtures ? 'Show logo on aisle end-caps' : 'Remove logo from aisle end-caps')
  return out
}

// ------------------------------------------------------------------ colour helpers

function rgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function luminance(hex: string) {
  const f = (c: number) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  const [r, g, b] = rgb(hex).map(f) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** White or near-black, whichever reads better on `bg`. */
export function textOn(bg: string) {
  const l = luminance(bg)
  return (l + 0.05) / 0.05 > 1.05 / (l + 0.05) ? '#1D2A24' : '#FFFFFF'
}

/** Mix toward white (amt > 0) or black (amt < 0). */
export function shadeHex(hex: string, amt: number) {
  const t = amt >= 0 ? 255 : 0
  const a = Math.abs(amt)
  return '#' + rgb(hex).map((c) => Math.round(c + (t - c) * a).toString(16).padStart(2, '0')).join('')
}

/** Accent colour in use: the Premium accent, otherwise a light tint of the theme colour. */
export function accentFor(p: BrandingProfile) {
  return p.accentColor ?? shadeHex(p.primaryColor, 0.62)
}
