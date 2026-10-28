import * as THREE from 'three'
import type { CartLine, ProductShape } from '~/types'
import { getProduct } from '~/data/products'
import { productDimensions, SHAPES_WITH_LABELS, type ShapeGeometry } from '../products/shapes'

const MAX_ITEMS = 18
const PER_LINE = 3
// Basket interior in cart-local space (see builders/cart.ts).
const GRID_X = [-0.15, 0, 0.15]
const GRID_Z = [-0.3, -0.12, 0.06, 0.22]
const FLOOR_Y = 0.51
const FONT = `'Plus Jakarta Sans', 'Segoe UI', system-ui, sans-serif`

/**
 * Shows the products the shopper has collected inside the 3D cart basket,
 * plus a floating label above the cart with the running total.
 */
export class CartContents {
  readonly group = new THREE.Group()
  private label: THREE.Sprite
  private canvas = document.createElement('canvas')
  private texture: THREE.CanvasTexture
  private materials = new Map<string, THREE.MeshStandardMaterial>()
  private counts = new Map<string, number>()
  private signature = ''

  constructor(private geometryFor: (shape: ProductShape) => ShapeGeometry) {
    this.group.name = 'cart-contents'
    this.canvas.width = 512
    this.canvas.height = 176
    this.texture = new THREE.CanvasTexture(this.canvas)
    this.texture.colorSpace = THREE.SRGBColorSpace
    this.label = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: this.texture, transparent: true, depthTest: false, depthWrite: false }),
    )
    this.label.scale.set(0.84, 0.29, 1)
    this.label.position.set(0, 1.32, -0.05)
    this.label.renderOrder = 20
    this.label.visible = false
    this.label.userData.shared = true
  }

  /** Attach to a cart group (the cart can move between the avatar and the scene). */
  attachTo(cart: THREE.Object3D) {
    cart.add(this.group)
    cart.add(this.label)
  }

  private material(hex: string) {
    let m = this.materials.get(hex)
    if (!m) this.materials.set(hex, (m = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.55 })))
    return m
  }

  update(lines: CartLine[], label: { count: number; total: string; savings?: string }) {
    const sig = JSON.stringify(lines) + label.total + (label.savings ?? '')
    if (sig === this.signature) return
    this.signature = sig

    const previous = this.counts
    this.counts = new Map()
    this.group.clear()

    let slot = 0
    for (const line of lines) {
      const p = getProduct(line.productId)
      if (!p) continue
      const n = Math.min(line.quantity, PER_LINE)
      this.counts.set(p.id, n)
      const alreadyShown = previous.get(p.id) ?? 0
      for (let i = 0; i < n && slot < MAX_ITEMS; i++, slot++) {
        const [w, h, d] = productDimensions(p)
        const s = Math.min(1, 0.15 / Math.max(w, d), 0.2 / h)
        const geo = this.geometryFor(p.shape)
        const holder = new THREE.Group()
        const cell = slot % 12
        const layer = Math.floor(slot / 12)
        holder.position.set(GRID_X[cell % 3]!, FLOOR_Y + layer * 0.13, GRID_Z[Math.floor(cell / 3)]!)
        holder.rotation.y = ((slot * 2.399) % 1) - 0.5
        const isTray = p.shape === 'tray'
        const body = new THREE.Mesh(geo.body, this.material(isTray ? '#F1EEE6' : p.color))
        body.scale.set(w * s, h * s, d * s)
        holder.add(body)
        if (geo.label && SHAPES_WITH_LABELS.includes(p.shape)) {
          const lbl = new THREE.Mesh(geo.label, this.material(isTray ? p.color : p.accent))
          lbl.scale.copy(body.scale)
          holder.add(lbl)
        }
        holder.traverse((o) => (o.userData.shared = true))
        // Newly collected items drop into the basket.
        if (i >= alreadyShown) holder.userData.drop = 0
        this.group.add(holder)
      }
    }

    this.drawLabel(label)
  }

  private drawLabel({ count, total, savings }: { count: number; total: string; savings?: string }) {
    this.label.visible = count > 0
    if (!count) return
    const ctx = this.canvas.getContext('2d')!
    const W = this.canvas.width
    const H = this.canvas.height
    ctx.clearRect(0, 0, W, H)
    // Pill with a pointer toward the cart.
    ctx.fillStyle = '#174D38'
    ctx.beginPath()
    ctx.roundRect(8, 8, W - 16, H - 40, 34)
    ctx.moveTo(W / 2 - 18, H - 33)
    ctx.lineTo(W / 2, H - 8)
    ctx.lineTo(W / 2 + 18, H - 33)
    ctx.fill()
    ctx.strokeStyle = '#E1C987'
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.roundRect(14, 14, W - 28, H - 52, 30)
    ctx.stroke()

    ctx.fillStyle = '#E1C987'
    ctx.textBaseline = 'middle'
    ctx.font = `700 34px ${FONT}`
    ctx.fillText(`${count} ${count === 1 ? 'item' : 'items'}${savings ? ` · save ${savings}` : ''}`, 40, 52)
    ctx.fillStyle = '#FFFFFF'
    ctx.font = `800 50px ${FONT}`
    ctx.fillText(total, 40, 102)
    this.texture.needsUpdate = true
  }

  /** Per-frame: animate newly added items dropping in. */
  tick(dt: number) {
    for (const holder of this.group.children) {
      const t = holder.userData.drop as number | undefined
      if (t === undefined) continue
      const next = Math.min(1, t + dt * 2.8)
      holder.userData.drop = next >= 1 ? undefined : next
      const k = 1 - Math.pow(1 - next, 3)
      holder.scale.setScalar(0.4 + 0.6 * k)
      holder.position.y = FLOOR_Y + Math.floor(this.group.children.indexOf(holder) / 12) * 0.13 + (1 - k) * 0.45
    }
  }

  dispose() {
    this.group.clear()
    this.materials.forEach((m) => m.dispose())
    this.materials.clear()
    this.texture.dispose()
    ;(this.label.material as THREE.Material).dispose()
  }
}
