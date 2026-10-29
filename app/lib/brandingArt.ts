import type { BrandingProfile } from '~/types/admin'
import { accentFor, shadeHex, textOn } from './branding'

/**
 * Canvas artwork for a supermarket's space inside the HelaMart store:
 * the entrance banner, the checkout fascia board and aisle end-cap logo
 * plates. The same drawings feed the 3D store and the admin preview, so what
 * the reviewer approves is exactly what shoppers see.
 */

type Img = CanvasImageSource & { width: number; height: number }
export interface BrandImages {
  logo?: Img | null
  banner?: Img | null
}

const FONT = `'Plus Jakarta Sans', 'Segoe UI', system-ui, sans-serif`

function canvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  return { c, ctx }
}

function fitText(ctx: CanvasRenderingContext2D, text: string, weight: number, size: number, maxW: number) {
  let s = size
  ctx.font = `${weight} ${s}px ${FONT}`
  while (ctx.measureText(text).width > maxW && s > 12) {
    s -= 2
    ctx.font = `${weight} ${s}px ${FONT}`
  }
  return s
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('')

/** Logo inside a white rounded badge (or the store's initials when there's no logo). */
function drawLogoBadge(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, p: BrandingProfile, name: string, logo?: Img | null) {
  ctx.save()
  ctx.fillStyle = '#FFFFFF'
  ctx.shadowColor = 'rgba(0,0,0,0.18)'
  ctx.shadowBlur = size * 0.08
  ctx.beginPath()
  ctx.roundRect(x, y, size, size, size * 0.18)
  ctx.fill()
  ctx.restore()
  if (logo) {
    const pad = size * 0.1
    const s = Math.min((size - pad * 2) / logo.width, (size - pad * 2) / logo.height)
    const w = logo.width * s
    const h = logo.height * s
    ctx.drawImage(logo, x + (size - w) / 2, y + (size - h) / 2, w, h)
  } else {
    ctx.fillStyle = p.primaryColor
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = `800 ${size * 0.42}px ${FONT}`
    ctx.fillText(initials(name), x + size / 2, y + size / 2 + size * 0.02)
    ctx.textAlign = 'left'
  }
}

function cover(ctx: CanvasRenderingContext2D, img: Img, x: number, y: number, w: number, h: number) {
  const s = Math.max(w / img.width, h / img.height)
  const sw = w / s
  const sh = h / s
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h)
}

/** Big hanging banner just inside the entrance (1500 × 600). */
export function storeBannerCanvas(p: BrandingProfile, name: string, img: BrandImages) {
  const W = 1500
  const H = 600
  const { c, ctx } = canvas(W, H)
  const accent = accentFor(p)
  const fg = textOn(p.primaryColor)

  if (img.banner) {
    cover(ctx, img.banner, 0, 0, W, 500)
  } else {
    const g = ctx.createLinearGradient(0, 0, W, 500)
    g.addColorStop(0, shadeHex(p.primaryColor, 0.12))
    g.addColorStop(1, shadeHex(p.primaryColor, -0.25))
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, 500)
    // Soft decorative rings.
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'
    ctx.lineWidth = 46
    for (const [x, y, r] of [[1320, 80, 240], [1420, 470, 170], [140, 520, 150]] as const) {
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.stroke()
    }
    drawLogoBadge(ctx, 90, 110, 260, p, name, img.logo)
    ctx.fillStyle = fg
    ctx.textBaseline = 'alphabetic'
    const size = fitText(ctx, name, 800, 118, W - 520)
    ctx.fillText(name, 420, 250 + size * 0.2)
    if (p.slogan) {
      ctx.globalAlpha = 0.9
      fitText(ctx, p.slogan, 600, 54, W - 520)
      ctx.fillText(p.slogan, 424, 360)
      ctx.globalAlpha = 1
    }
  }

  // Name bar.
  ctx.fillStyle = p.primaryColor
  ctx.fillRect(0, 500, W, 100)
  ctx.fillStyle = accent
  ctx.fillRect(0, 494, W, 10)
  if (img.banner) drawLogoBadge(ctx, 28, 512, 76, p, name, img.logo)
  ctx.fillStyle = fg
  ctx.textBaseline = 'middle'
  const left = img.banner ? 128 : 40
  const nameSize = fitText(ctx, name, 800, 50, 640)
  ctx.fillText(name, left, 552)
  if (p.slogan && img.banner) {
    ctx.globalAlpha = 0.85
    ctx.textAlign = 'right'
    fitText(ctx, p.slogan, 600, 34, W - left - ctx.measureText(name).width - 120)
    ctx.fillText(p.slogan, W - 40, 552)
    ctx.textAlign = 'left'
    ctx.globalAlpha = 1
  } else if (!img.banner) {
    ctx.globalAlpha = 0.85
    ctx.textAlign = 'right'
    ctx.font = `600 ${Math.round(nameSize * 0.6)}px ${FONT}`
    ctx.fillText('Welcome — happy shopping', W - 40, 552)
    ctx.textAlign = 'left'
    ctx.globalAlpha = 1
  }
  return c
}

/** Long fascia board above the checkout lanes (2048 × 192). */
export function checkoutBoardCanvas(p: BrandingProfile, name: string, img: BrandImages) {
  const W = 2048
  const H = 192
  const { c, ctx } = canvas(W, H)
  const g = ctx.createLinearGradient(0, 0, 0, H)
  g.addColorStop(0, shadeHex(p.primaryColor, 0.06))
  g.addColorStop(1, shadeHex(p.primaryColor, -0.18))
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = accentFor(p)
  ctx.fillRect(0, H - 16, W, 16)
  drawLogoBadge(ctx, 28, 22, 132, p, name, img.logo)
  const fg = textOn(p.primaryColor)
  ctx.fillStyle = fg
  ctx.textBaseline = 'middle'
  fitText(ctx, name, 800, 76, 900)
  ctx.fillText(name, 196, p.slogan ? 72 : 92)
  if (p.slogan) {
    ctx.globalAlpha = 0.85
    fitText(ctx, p.slogan, 600, 38, 900)
    ctx.fillText(p.slogan, 198, 132)
    ctx.globalAlpha = 1
  }
  ctx.textAlign = 'right'
  ctx.font = `800 64px ${FONT}`
  ctx.fillText('Checkout  ›', W - 48, 90)
  return c
}

/** Square logo plate for aisle end-caps (256 × 256). */
export function logoPlateCanvas(p: BrandingProfile, name: string, img: BrandImages) {
  const { c, ctx } = canvas(256, 256)
  ctx.fillStyle = p.primaryColor
  ctx.beginPath()
  ctx.roundRect(0, 0, 256, 256, 36)
  ctx.fill()
  ctx.fillStyle = accentFor(p)
  ctx.fillRect(0, 226, 256, 12)
  drawLogoBadge(ctx, 38, 26, 180, p, name, img.logo)
  return c
}

/** A promotional wall banner with a slim frame in the theme colour (1500 × 540). */
export function promoBannerCanvas(p: BrandingProfile, image: Img) {
  const { c, ctx } = canvas(1500, 540)
  ctx.fillStyle = p.primaryColor
  ctx.fillRect(0, 0, 1500, 540)
  cover(ctx, image, 20, 20, 1460, 500)
  return c
}

/** Decode an image reference (stored media or a local preview URL) for drawing. */
export async function decodeImage(src?: string | null): Promise<ImageBitmap | null> {
  if (!src) return null
  if (src.startsWith('media:')) {
    const { loadImageSource } = await import('~/services/mock/mediaStore')
    return loadImageSource(src)
  }
  try {
    return await createImageBitmap(await (await fetch(src)).blob())
  } catch {
    return null
  }
}
