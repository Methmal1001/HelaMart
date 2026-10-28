import * as THREE from 'three'

const FONT = `'Plus Jakarta Sans', 'Segoe UI', system-ui, sans-serif`

function canvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('2D canvas unavailable')
  return { c, ctx }
}

function toTexture(c: HTMLCanvasElement, maxAnisotropy = 4) {
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = maxAnisotropy
  t.needsUpdate = true
  return t
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

/** Fit text to a max width by shrinking the font size. */
function fitText(ctx: CanvasRenderingContext2D, text: string, weight: number, size: number, maxWidth: number) {
  let s = size
  do {
    ctx.font = `${weight} ${s}px ${FONT}`
    s -= 2
  } while (ctx.measureText(text).width > maxWidth && s > 10)
}

function drawCartIcon(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
  const s = size / 24
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(s, s)
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(2, 3)
  ctx.lineTo(5, 3)
  ctx.lineTo(7.5, 15)
  ctx.lineTo(18.5, 15)
  ctx.lineTo(21, 7)
  ctx.lineTo(6, 7)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(9, 19.5, 1.6, 0, Math.PI * 2)
  ctx.arc(17, 19.5, 1.6, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/** Main storefront sign: "HelaMart" + tagline on deep green. */
export function storefrontSignTexture() {
  const { c, ctx } = canvas(2048, 512)
  ctx.fillStyle = '#174D38'
  ctx.fillRect(0, 0, c.width, c.height)
  // Gold inset frame.
  ctx.strokeStyle = '#E1C987'
  ctx.lineWidth = 10
  roundRect(ctx, 26, 26, c.width - 52, c.height - 52, 30)
  ctx.stroke()

  // Logo mark.
  ctx.fillStyle = '#E1C987'
  roundRect(ctx, 170, 126, 220, 220, 48)
  ctx.fill()
  drawCartIcon(ctx, 196, 152, 168, '#174D38')

  ctx.fillStyle = '#E1C987'
  ctx.textBaseline = 'alphabetic'
  ctx.font = `800 210px ${FONT}`
  ctx.fillText('HelaMart', 450, 300)
  ctx.fillStyle = '#F7F5EF'
  ctx.font = `600 64px ${FONT}`
  ctx.fillText('Everything for Every Home.', 458, 400)
  return toTexture(c, 8)
}

/** Hanging / wall section sign. */
export function sectionSignTexture(title: string, subtitle: string | undefined, accent: string) {
  const { c, ctx } = canvas(1024, 256)
  ctx.fillStyle = '#FBFAF6'
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.fillStyle = '#174D38'
  ctx.fillRect(0, 0, c.width, 26)
  ctx.fillStyle = accent
  ctx.fillRect(0, 26, c.width, 12)

  let x = 48
  if (subtitle) {
    ctx.fillStyle = '#174D38'
    roundRect(ctx, 40, 78, 210, 132, 22)
    ctx.fill()
    ctx.fillStyle = '#E1C987'
    fitText(ctx, subtitle, 800, 54, 180)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(subtitle, 145, 146)
    ctx.textAlign = 'left'
    x = 285
  }
  ctx.fillStyle = '#17352A'
  ctx.textBaseline = 'middle'
  fitText(ctx, title, 800, 84, c.width - x - 40)
  ctx.fillText(title, x, 148)
  return toTexture(c)
}

export function smallLabelTexture(text: string, bg = '#174D38', fg = '#E1C987') {
  const { c, ctx } = canvas(512, 128)
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.fillStyle = fg
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  fitText(ctx, text, 800, 64, 470)
  ctx.fillText(text, 256, 68)
  return toTexture(c)
}

/** Polished vinyl tile floor. */
export function floorTexture() {
  const { c, ctx } = canvas(512, 512)
  ctx.fillStyle = '#E9E6DC'
  ctx.fillRect(0, 0, 512, 512)
  // Subtle speckle.
  for (let i = 0; i < 2200; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(120,110,90,0.07)' : 'rgba(255,255,255,0.18)'
    ctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 2)
  }
  ctx.strokeStyle = 'rgba(140,130,110,0.35)'
  ctx.lineWidth = 3
  for (let i = 0; i <= 512; i += 256) {
    ctx.beginPath()
    ctx.moveTo(i, 0)
    ctx.lineTo(i, 512)
    ctx.moveTo(0, i)
    ctx.lineTo(512, i)
    ctx.stroke()
  }
  const t = toTexture(c, 8)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

export function pavementTexture() {
  const { c, ctx } = canvas(256, 256)
  ctx.fillStyle = '#CFCBC1'
  ctx.fillRect(0, 0, 256, 256)
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(90,80,70,0.08)' : 'rgba(255,255,255,0.15)'
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2)
  }
  ctx.strokeStyle = 'rgba(110,100,90,0.35)'
  ctx.lineWidth = 2
  ctx.strokeRect(1, 1, 254, 254)
  const t = toTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

/** Vertical sky gradient used as the scene background. */
export function skyTexture() {
  const { c, ctx } = canvas(16, 512)
  const g = ctx.createLinearGradient(0, 0, 0, 512)
  g.addColorStop(0, '#8FC3DF')
  g.addColorStop(0.55, '#D7E9EE')
  g.addColorStop(1, '#F4EFE2')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 16, 512)
  return toTexture(c)
}

/** Wire mesh used for the shopping-cart basket (alpha tested). */
export function wireGridTexture() {
  const { c, ctx } = canvas(128, 128)
  ctx.clearRect(0, 0, 128, 128)
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 6
  for (let i = 0; i <= 128; i += 21.3) {
    ctx.beginPath()
    ctx.moveTo(i, 0)
    ctx.lineTo(i, 128)
    ctx.moveTo(0, i)
    ctx.lineTo(128, i)
    ctx.stroke()
  }
  const t = toTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

/** Soft radial blob used as a cheap contact shadow under characters. */
export function blobShadowTexture() {
  const { c, ctx } = canvas(128, 128)
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62)
  g.addColorStop(0, 'rgba(0,0,0,0.45)')
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 128)
  return toTexture(c)
}

export function doorDecalTexture() {
  const { c, ctx } = canvas(512, 128)
  ctx.clearRect(0, 0, 512, 128)
  ctx.fillStyle = 'rgba(225,201,135,0.95)'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `700 40px ${FONT}`
  ctx.fillText('AUTOMATIC DOOR', 256, 64)
  return toTexture(c)
}

export function welcomeMatTexture() {
  const { c, ctx } = canvas(1024, 256)
  ctx.fillStyle = '#174D38'
  ctx.fillRect(0, 0, 1024, 256)
  ctx.strokeStyle = '#E1C987'
  ctx.lineWidth = 8
  ctx.strokeRect(18, 18, 988, 220)
  ctx.fillStyle = '#F6EBC9'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `800 104px ${FONT}`
  ctx.fillText('AYUBOWAN', 512, 134)
  return toTexture(c)
}
