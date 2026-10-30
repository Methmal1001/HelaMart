import type { Product as CatalogProduct } from '~/types'

/** Anything with a product's look (catalogue items and admin records alike). */
type Product = Omit<CatalogProduct, 'stock'>
import { productDimensions } from './productDims'

/**
 * Generated, photo-style packaging artwork for products that don't have a
 * real photo yet: shaded package silhouettes with brand / name / size labels
 * on a transparent background. Used on the 3D shelves and in the UI.
 * Uploaded supermarket photos always take priority over this artwork.
 */

const FONT = `'Plus Jakarta Sans', 'Segoe UI', system-ui, sans-serif`
const H = 384
const canvasCache = new Map<string, HTMLCanvasElement>()
const urlCache = new Map<string, string>()

const keyOf = (p: Product) => `${p.id}|${p.shape}|${p.color}|${p.accent}|${p.name}|${p.brand}|${p.size}`

// ------------------------------------------------------------------ colour helpers

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function shade(hex: string, amt: number) {
  const [r, g, b] = rgb(hex)
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt))))
  return `rgb(${f(r)},${f(g)},${f(b)})`
}

function luminance(hex: string) {
  const [r, g, b] = rgb(hex).map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

const ink = (bg: string) => (luminance(bg) > 0.45 ? '#1d2a24' : '#ffffff')

/** Cylinder-like horizontal shading across [x0, x1]. */
function cylinder(ctx: CanvasRenderingContext2D, color: string, x0: number, x1: number) {
  const g = ctx.createLinearGradient(x0, 0, x1, 0)
  g.addColorStop(0, shade(color, -0.38))
  g.addColorStop(0.22, shade(color, 0.12))
  g.addColorStop(0.32, shade(color, 0.32))
  g.addColorStop(0.55, color)
  g.addColorStop(1, shade(color, -0.45))
  return g
}

/** Flat pack front with soft vertical light falloff. */
function flat(ctx: CanvasRenderingContext2D, color: string, y0: number, y1: number) {
  const g = ctx.createLinearGradient(0, y0, 0, y1)
  g.addColorStop(0, shade(color, 0.14))
  g.addColorStop(1, shade(color, -0.16))
  return g
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number) {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const test = line ? `${line} ${w}` : w
    if (ctx.measureText(test).width <= maxWidth || !line) line = test
    else {
      lines.push(line)
      line = w
    }
  }
  if (line) lines.push(line)
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines)
    kept[maxLines - 1] = `${kept[maxLines - 1]!.replace(/\s+\S*$/, '')}…`
    return kept
  }
  return lines
}

/** Brand / name / size label block centred in a rectangle. */
function label(ctx: CanvasRenderingContext2D, p: Product, x: number, y: number, w: number, h: number, bg: string, opts: { brand?: boolean; size?: boolean } = {}) {
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()
  ctx.fillStyle = flat(ctx, bg, y, y + h)
  ctx.fillRect(x, y, w, h)
  const fg = ink(bg)
  ctx.fillStyle = fg
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const pad = Math.max(4, w * 0.06)
  const nameSize = Math.max(11, Math.min(34, w * 0.17, h * 0.26))
  const blocks: { text: string; size: number; weight: number; alpha: number }[] = []
  if (opts.brand !== false) blocks.push({ text: p.brand.toUpperCase(), size: Math.max(8, nameSize * 0.48), weight: 800, alpha: 0.85 })
  ctx.font = `800 ${nameSize}px ${FONT}`
  const nameLines = wrap(ctx, p.name, w - pad * 2, h > 90 ? 3 : 2)
  for (const l of nameLines) blocks.push({ text: l, size: nameSize, weight: 800, alpha: 1 })
  if (opts.size !== false) blocks.push({ text: p.size, size: Math.max(8, nameSize * 0.52), weight: 700, alpha: 0.9 })
  const total = blocks.reduce((s, b) => s + b.size * 1.12, 0)
  let cy = y + h / 2 - total / 2
  for (const b of blocks) {
    ctx.globalAlpha = b.alpha
    ctx.font = `${b.weight} ${b.size}px ${FONT}`
    ctx.fillText(b.text, x + w / 2, cy + (b.size * 1.12) / 2, w - pad)
    cy += b.size * 1.12
  }
  ctx.restore()
}

function gloss(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const g = ctx.createLinearGradient(x, 0, x + w, 0)
  g.addColorStop(0, 'rgba(255,255,255,0)')
  g.addColorStop(0.5, 'rgba(255,255,255,0.35)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(x, y, w, h)
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

// ------------------------------------------------------------------ shapes

function drawBottle(ctx: CanvasRenderingContext2D, p: Product, W: number) {
  const neck = W * 0.34
  const cx = W / 2
  ctx.beginPath()
  ctx.moveTo(cx - neck / 2, H * 0.08)
  ctx.lineTo(cx - neck / 2, H * 0.2)
  ctx.bezierCurveTo(cx - neck / 2, H * 0.27, W * 0.02, H * 0.27, W * 0.02, H * 0.36)
  ctx.lineTo(W * 0.02, H * 0.95)
  ctx.quadraticCurveTo(W * 0.02, H, W * 0.12, H)
  ctx.lineTo(W * 0.88, H)
  ctx.quadraticCurveTo(W * 0.98, H, W * 0.98, H * 0.95)
  ctx.lineTo(W * 0.98, H * 0.36)
  ctx.bezierCurveTo(W * 0.98, H * 0.27, cx + neck / 2, H * 0.27, cx + neck / 2, H * 0.2)
  ctx.lineTo(cx + neck / 2, H * 0.08)
  ctx.closePath()
  ctx.fillStyle = cylinder(ctx, p.color, 0, W)
  ctx.fill()
  // Cap.
  roundRect(ctx, cx - neck * 0.62, 0, neck * 1.24, H * 0.095, 6)
  ctx.fillStyle = cylinder(ctx, shade(p.accent, -0.15), cx - neck * 0.62, cx + neck * 0.62)
  ctx.fill()
  label(ctx, p, W * 0.02, H * 0.47, W * 0.96, H * 0.36, p.accent)
  gloss(ctx, W * 0.16, H * 0.1, W * 0.12, H * 0.86)
}

function drawCan(ctx: CanvasRenderingContext2D, p: Product, W: number) {
  roundRect(ctx, W * 0.02, H * 0.03, W * 0.96, H * 0.95, W * 0.08)
  ctx.fillStyle = cylinder(ctx, p.color, 0, W)
  ctx.fill()
  for (const y of [H * 0.03, H * 0.93]) {
    roundRect(ctx, W * 0.02, y, W * 0.96, H * 0.05, W * 0.05)
    ctx.fillStyle = cylinder(ctx, '#b9c0c4', 0, W)
    ctx.fill()
  }
  label(ctx, p, W * 0.02, H * 0.3, W * 0.96, H * 0.42, p.accent, { brand: true })
  gloss(ctx, W * 0.14, H * 0.05, W * 0.16, H * 0.9)
}

function drawJar(ctx: CanvasRenderingContext2D, p: Product, W: number) {
  roundRect(ctx, W * 0.04, 0, W * 0.92, H * 0.15, 8)
  ctx.fillStyle = cylinder(ctx, shade(p.accent, -0.1), 0, W)
  ctx.fill()
  roundRect(ctx, W * 0.01, H * 0.13, W * 0.98, H * 0.87, W * 0.12)
  ctx.fillStyle = cylinder(ctx, p.color, 0, W)
  ctx.fill()
  label(ctx, p, W * 0.01, H * 0.35, W * 0.98, H * 0.42, p.accent)
  gloss(ctx, W * 0.14, H * 0.16, W * 0.12, H * 0.8)
}

function drawBox(ctx: CanvasRenderingContext2D, p: Product, W: number) {
  const side = W * 0.07
  ctx.fillStyle = flat(ctx, p.color, 0, H)
  ctx.fillRect(0, 0, W - side, H)
  ctx.fillStyle = shade(p.color, -0.35)
  ctx.beginPath()
  ctx.moveTo(W - side, 0)
  ctx.lineTo(W, H * 0.02)
  ctx.lineTo(W, H)
  ctx.lineTo(W - side, H)
  ctx.fill()
  // Accent stripes + label.
  ctx.fillStyle = p.accent
  ctx.fillRect(0, H * 0.06, W - side, H * 0.05)
  ctx.fillRect(0, H * 0.89, W - side, H * 0.05)
  label(ctx, p, 0, H * 0.2, W - side, H * 0.6, p.color === p.accent ? shade(p.color, 0.3) : p.color)
  ctx.strokeStyle = 'rgba(0,0,0,0.12)'
  ctx.lineWidth = 2
  ctx.strokeRect(1, 1, W - side - 2, H - 2)
}

function drawBag(ctx: CanvasRenderingContext2D, p: Product, W: number) {
  const crimp = (y: number) => {
    for (let x = 0; x <= W; x += W / 14) ctx.lineTo(x, y + ((Math.round(x / (W / 14)) % 2) ? 6 : 0))
  }
  ctx.beginPath()
  ctx.moveTo(W * 0.04, H * 0.06)
  crimp(H * 0.03)
  ctx.lineTo(W * 0.96, H * 0.06)
  ctx.bezierCurveTo(W * 1.02, H * 0.4, W * 1.02, H * 0.7, W * 0.96, H * 0.97)
  ctx.lineTo(W * 0.04, H * 0.97)
  ctx.bezierCurveTo(-W * 0.02, H * 0.7, -W * 0.02, H * 0.4, W * 0.04, H * 0.06)
  ctx.closePath()
  ctx.fillStyle = cylinder(ctx, p.color, 0, W)
  ctx.fill()
  ctx.fillStyle = shade(p.accent, -0.1)
  ctx.fillRect(W * 0.04, H * 0.06, W * 0.92, H * 0.04)
  roundRect(ctx, W * 0.1, H * 0.32, W * 0.8, H * 0.44, 14)
  ctx.save()
  ctx.clip()
  label(ctx, p, W * 0.1, H * 0.32, W * 0.8, H * 0.44, p.accent)
  ctx.restore()
  gloss(ctx, W * 0.12, H * 0.1, W * 0.16, H * 0.84)
}

function drawCarton(ctx: CanvasRenderingContext2D, p: Product, W: number) {
  ctx.beginPath()
  ctx.moveTo(W * 0.3, 0)
  ctx.lineTo(W * 0.7, 0)
  ctx.lineTo(W * 0.98, H * 0.16)
  ctx.lineTo(W * 0.02, H * 0.16)
  ctx.closePath()
  ctx.fillStyle = shade(p.color, -0.12)
  ctx.fill()
  ctx.fillStyle = flat(ctx, p.color, H * 0.16, H)
  ctx.fillRect(W * 0.02, H * 0.16, W * 0.96, H * 0.84)
  label(ctx, p, W * 0.02, H * 0.36, W * 0.96, H * 0.42, p.accent)
  ctx.fillStyle = 'rgba(0,0,0,0.15)'
  ctx.fillRect(W * 0.78, H * 0.16, W * 0.2, H * 0.84)
}

function drawTray(ctx: CanvasRenderingContext2D, p: Product, W: number) {
  roundRect(ctx, 0, H * 0.18, W, H * 0.82, 16)
  ctx.fillStyle = flat(ctx, '#f2efe7', H * 0.18, H)
  ctx.fill()
  // Contents seen through cling film.
  const rows = /egg/.test(p.id) ? 2 : 1
  const cols = /egg/.test(p.id) ? 5 : 3
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = W * (0.14 + (0.72 * (c + 0.5)) / cols)
      const cy = H * (rows === 1 ? 0.48 : 0.36 + r * 0.26)
      const rx = (W / cols) * 0.42
      const ry = H * (rows === 1 ? 0.24 : 0.13)
      const g = ctx.createRadialGradient(cx - rx * 0.3, cy - ry * 0.4, 2, cx, cy, Math.max(rx, ry))
      g.addColorStop(0, shade(p.color, 0.3))
      g.addColorStop(1, shade(p.color, -0.25))
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.fillStyle = 'rgba(255,255,255,0.22)'
  ctx.fillRect(W * 0.04, H * 0.2, W * 0.92, H * 0.18)
  label(ctx, p, W * 0.56, H * 0.66, W * 0.4, H * 0.3, p.accent, { brand: false })
}

function drawLoaf(ctx: CanvasRenderingContext2D, p: Product, W: number) {
  ctx.beginPath()
  ctx.moveTo(0, H * 0.98)
  ctx.lineTo(0, H * 0.42)
  ctx.bezierCurveTo(0, H * 0.02, W, H * 0.02, W, H * 0.42)
  ctx.lineTo(W, H * 0.98)
  ctx.closePath()
  const g = ctx.createLinearGradient(0, 0, 0, H)
  g.addColorStop(0, shade(p.color, -0.25))
  g.addColorStop(0.45, p.color)
  g.addColorStop(1, shade(p.color, 0.25))
  ctx.fillStyle = g
  ctx.fill()
  ctx.strokeStyle = shade(p.color, -0.45)
  ctx.lineWidth = 5
  for (let i = 1; i <= 3; i++) {
    ctx.beginPath()
    ctx.moveTo(W * (i / 4) - 18, H * 0.2)
    ctx.quadraticCurveTo(W * (i / 4), H * 0.12, W * (i / 4) + 18, H * 0.22)
    ctx.stroke()
  }
  label(ctx, p, W * 0.25, H * 0.55, W * 0.5, H * 0.34, p.accent, { brand: false })
  ctx.fillStyle = 'rgba(255,255,255,0.18)'
  ctx.fillRect(0, H * 0.3, W, H * 0.08)
}

function drawRoll(ctx: CanvasRenderingContext2D, p: Product, W: number) {
  const n = W > H * 0.8 ? 2 : 1
  for (let i = 0; i < n; i++) {
    const x0 = (W / n) * i
    roundRect(ctx, x0 + 4, 0, W / n - 8, H, 26)
    ctx.fillStyle = cylinder(ctx, p.color, x0, x0 + W / n)
    ctx.fill()
  }
  ctx.fillStyle = 'rgba(255,255,255,0.18)'
  ctx.fillRect(0, 0, W, H)
  label(ctx, p, 0, H * 0.32, W, H * 0.36, p.accent)
}

function drawProduce(ctx: CanvasRenderingContext2D, p: Product, W: number) {
  const long = p.shape === 'long'
  const pieces = long
    ? [[0.5, 0.35, -0.25], [0.48, 0.55, 0.05], [0.52, 0.75, 0.3]]
    : [[0.3, 0.68, 0], [0.7, 0.68, 0], [0.5, 0.36, 0]]
  for (const [fx, fy, rot] of pieces) {
    const cx = W * fx!
    const cy = H * fy!
    const rx = long ? W * 0.46 : W * 0.29
    const ry = long ? H * 0.1 : H * 0.2
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(rot!)
    const g = ctx.createRadialGradient(-rx * 0.35, -ry * 0.4, 2, 0, 0, Math.max(rx, ry))
    g.addColorStop(0, shade(p.color, 0.35))
    g.addColorStop(0.6, p.color)
    g.addColorStop(1, shade(p.color, -0.35))
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
  ctx.strokeStyle = shade(p.accent, -0.2)
  ctx.lineWidth = 6
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(W * 0.5, H * 0.18)
  ctx.quadraticCurveTo(W * 0.54, H * 0.08, W * 0.64, H * 0.05)
  ctx.stroke()
}

// ------------------------------------------------------------------ public API

/** Natural width:height of the product front, used to size art and 3D cards. */
export function productAspect(p: Product) {
  const [w, h] = productDimensions(p)
  if (p.shape === 'round' || p.shape === 'long') return 0.9
  return Math.max(0.25, Math.min(1.6, w / h))
}

/** Transparent canvas with the product's packaging artwork (cached). */
export function productArtCanvas(p: Product): HTMLCanvasElement {
  const key = keyOf(p)
  const cached = canvasCache.get(key)
  if (cached) return cached
  const W = Math.round(H * productAspect(p))
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')!
  switch (p.shape) {
    case 'bottle': drawBottle(ctx, p, W); break
    case 'can': drawCan(ctx, p, W); break
    case 'jar': drawJar(ctx, p, W); break
    case 'bag': drawBag(ctx, p, W); break
    case 'carton': drawCarton(ctx, p, W); break
    case 'tray': drawTray(ctx, p, W); break
    case 'loaf': drawLoaf(ctx, p, W); break
    case 'roll': drawRoll(ctx, p, W); break
    case 'round':
    case 'long': drawProduce(ctx, p, W); break
    default: drawBox(ctx, p, W)
  }
  canvasCache.set(key, c)
  return c
}

/** PNG data URL of the artwork (cached) — for <img> thumbnails. */
export function productArtUrl(p: Product): string {
  const key = keyOf(p)
  let url = urlCache.get(key)
  if (!url) {
    url = productArtCanvas(p).toDataURL('image/png')
    urlCache.set(key, url)
  }
  return url
}

/** Red "special offer" shelf tag: badge, promo price and the old price struck through. */
export function promoTagCanvas(p: Product, badge: string, priceText: string, wasText?: string): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 96
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#E23B3B'
  ctx.fillRect(0, 0, 256, 96)
  ctx.fillStyle = '#FFE45C'
  ctx.fillRect(0, 0, 256, 26)
  ctx.fillStyle = '#B3162B'
  ctx.textBaseline = 'middle'
  ctx.font = `900 19px ${FONT}`
  ctx.fillText(badge, 8, 14, 150)
  ctx.textAlign = 'right'
  ctx.font = `700 14px ${FONT}`
  ctx.fillText('SPECIAL', 248, 14)
  ctx.textAlign = 'left'
  ctx.fillStyle = '#FFFFFF'
  ctx.font = `800 36px ${FONT}`
  ctx.fillText(priceText, 8, 58, 170)
  ctx.font = `600 14px ${FONT}`
  ctx.fillText(wrap(ctx, p.name, 240, 1)[0] ?? p.name, 8, 84, 240)
  if (wasText) {
    ctx.textAlign = 'right'
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.font = `600 16px ${FONT}`
    ctx.fillText(wasText, 248, 58, 76)
    const w = Math.min(76, ctx.measureText(wasText).width)
    ctx.fillRect(248 - w, 57, w, 2)
  }
  return c
}

/** Yellow shelf-edge price tag. */
export function priceTagCanvas(p: Product, priceText: string): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 96
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#FFE45C'
  ctx.fillRect(0, 0, 256, 96)
  ctx.fillStyle = '#174D38'
  ctx.fillRect(0, 0, 256, 10)
  ctx.fillStyle = '#1d2a24'
  ctx.textBaseline = 'middle'
  ctx.font = `700 19px ${FONT}`
  ctx.fillText(wrap(ctx, p.name, 165, 1)[0] ?? p.name, 10, 30, 165)
  ctx.font = `800 40px ${FONT}`
  ctx.fillText(priceText, 10, 68, 200)
  ctx.font = `600 14px ${FONT}`
  ctx.textAlign = 'right'
  ctx.fillText(p.size, 248, 30, 70)
  return c
}
