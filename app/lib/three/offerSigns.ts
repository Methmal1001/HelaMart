import * as THREE from 'three'
import type { CategoryId } from '~/types'
import { GONDOLA, GONDOLA_CATEGORIES, GONDOLA_X } from '~/data/storeLayout'
import { getCategory } from '~/data/categories'

/**
 * In-store promotion signage, like a real supermarket's:
 *  - a red "wobbler" board on top of both end-caps of every aisle whose
 *    category is on offer ("20% OFF · Beverages")
 *  - a double-sided "Offers this week" board hanging over the main walkway
 */

export interface PromoBoard {
  headline: string
  subject: string
  categoryId?: CategoryId
}
export interface PromoBoards {
  storeName: string
  offers: PromoBoard[]
}

const FONT = `'Plus Jakarta Sans', 'Segoe UI', system-ui, sans-serif`

function canvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return { c, ctx: c.getContext('2d')! }
}

function fit(ctx: CanvasRenderingContext2D, text: string, weight: number, size: number, maxW: number) {
  let s = size
  do ctx.font = `${weight} ${s}px ${FONT}`
  while (ctx.measureText(text).width > maxW && (s -= 2) > 10)
}

/** End-cap wobbler: starburst headline over the category name. */
function endcapCanvas(o: PromoBoard) {
  const { c, ctx } = canvas(512, 300)
  ctx.fillStyle = '#E23B3B'
  ctx.beginPath()
  ctx.roundRect(0, 0, 512, 300, 28)
  ctx.fill()
  ctx.fillStyle = '#FFE45C'
  ctx.fillRect(0, 0, 512, 64)
  ctx.fillStyle = '#B3162B'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `900 34px ${FONT}`
  ctx.fillText('SPECIAL OFFER', 256, 34)
  ctx.fillStyle = '#FFFFFF'
  fit(ctx, o.headline, 900, 96, 470)
  ctx.fillText(o.headline, 256, 150)
  ctx.fillStyle = '#FFE9A8'
  fit(ctx, o.subject, 700, 38, 470)
  ctx.fillText(o.subject, 256, 238)
  return c
}

/** "Offers this week" board: up to four offer tiles. */
function boardCanvas(b: PromoBoards) {
  const W = 1600
  const H = 560
  const { c, ctx } = canvas(W, H)
  ctx.fillStyle = '#FFF7E0'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#E23B3B'
  ctx.fillRect(0, 0, W, 130)
  ctx.fillStyle = '#FFFFFF'
  ctx.textBaseline = 'middle'
  ctx.font = `900 72px ${FONT}`
  ctx.fillText('OFFERS THIS WEEK', 48, 68)
  ctx.textAlign = 'right'
  fit(ctx, b.storeName, 700, 40, 560)
  ctx.fillStyle = '#FFE9A8'
  ctx.fillText(b.storeName, W - 48, 68)
  const tiles = b.offers.slice(0, 4)
  const gap = 28
  const tw = (W - 96 - gap * (tiles.length - 1)) / tiles.length
  tiles.forEach((o, i) => {
    const x = 48 + i * (tw + gap)
    ctx.fillStyle = '#FFFFFF'
    ctx.beginPath()
    ctx.roundRect(x, 165, tw, 350, 26)
    ctx.fill()
    ctx.strokeStyle = '#F2C7C7'
    ctx.lineWidth = 4
    ctx.stroke()
    ctx.textAlign = 'center'
    ctx.fillStyle = '#E23B3B'
    fit(ctx, o.headline, 900, 84, tw - 40)
    ctx.fillText(o.headline, x + tw / 2, 290)
    ctx.fillStyle = '#1D2A24'
    fit(ctx, o.subject, 700, 40, tw - 40)
    ctx.fillText(o.subject, x + tw / 2, 400)
  })
  return c
}

export class OfferSignsLayer {
  readonly group = new THREE.Group()
  private owned: { dispose(): void }[] = []

  constructor(private maxAnisotropy: number) {
    this.group.name = 'offer-signs'
  }

  apply(boards: PromoBoards | null) {
    this.clear()
    if (!boards?.offers.length) return

    // End-cap wobblers above aisles whose category is on offer.
    // By store area, so offers on a supermarket's own categories show on the aisle where they're shelved.
    const byArea = new Map<string, PromoBoard>()
    for (const o of boards.offers) {
      const area = o.categoryId ? getCategory(o.categoryId).area : undefined
      if (area && !byArea.has(area)) byArea.set(area, o)
    }
    GONDOLA_CATEGORIES.forEach((cat, i) => {
      const o = byArea.get(cat)
      const x = GONDOLA_X[i]
      if (!o || x === undefined) return
      const tex = this.texture(endcapCanvas(o))
      for (const [z, rot] of [[GONDOLA.zStart + 0.07, 0], [GONDOLA.zEnd - 0.07, Math.PI]] as const) {
        // Sits on the end-cap, below the hanging aisle sign.
        this.plane(tex, 1.0, 0.6, new THREE.Vector3(x, GONDOLA.height + 0.42, z), rot)
      }
    })

    // Offers board over the main walkway (both faces), above the line of sight to the aisle signs.
    const tex = this.texture(boardCanvas(boards))
    for (const back of [false, true]) this.plane(tex, 3.6, 1.26, new THREE.Vector3(0, 4.05, -12.6 + (back ? -0.02 : 0.02)), back ? Math.PI : 0)
  }

  private texture(c: HTMLCanvasElement) {
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = this.maxAnisotropy
    this.owned.push(t)
    return t
  }

  private plane(map: THREE.Texture, w: number, h: number, pos: THREE.Vector3, rotY: number) {
    const geometry = new THREE.PlaneGeometry(w, h)
    // Backlit promo signage: true colours regardless of store lighting.
    const material = new THREE.MeshBasicMaterial({ map, toneMapped: false })
    const m = new THREE.Mesh(geometry, material)
    m.position.copy(pos)
    m.rotation.y = rotY
    this.group.add(m)
    this.owned.push(geometry, material)
  }

  private clear() {
    for (const o of this.owned) o.dispose()
    this.owned = []
    this.group.clear()
  }

  dispose() {
    this.clear()
  }
}
