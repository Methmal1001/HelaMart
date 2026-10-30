import * as THREE from 'three'
import type { CategoryId, Product, ProductShape } from '~/types'
import { productsInCategory } from '~/data/products'
import { createShapeGeometries, productDimensions, SHAPES_WITH_LABELS, type ShapeGeometry } from './shapes'
import { buildProductAtlas, type ProductAtlas, type ShelfPromos } from './atlas'

/**
 * A surface that products are placed on. The slot frame's origin is the
 * front-centre of the surface; local +x runs along the shelf, local +z points
 * toward the shopper, +y is up.
 */
export interface ProductSlot {
  /** Store section the slot belongs to — products are batched per section for frustum culling. */
  sectionId: string
  categoryId: CategoryId
  frame: THREE.Matrix4
  length: number
  depth: number
  clearance: number
  /** shelf = rows of facings; bin = heaped produce; flat = laid out in a chest freezer. */
  mode: 'shelf' | 'bin' | 'flat'
  /** Restrict which shapes may appear (e.g. bakery tables only show bread). */
  shapes?: ProductShape[]
  /** Pin a specific product to this slot (used for produce bins). */
  productId?: string
}

interface Placement {
  product: Product
  matrix: THREE.Matrix4
  sectionId: string
  /** Shelf items are photo cards (and shelf-edge price tags) drawn from the atlas. */
  card?: 'picture' | 'tag'
}

export interface ProductLocation {
  position: THREE.Vector3
  /** Horizontal direction the product faces (toward the shopper). */
  normal: THREE.Vector3
  categoryId: CategoryId
}

/** Deterministic PRNG so the store looks the same on every visit. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const TRAY_BASE = '#F1EEE6'
const tmpM = new THREE.Matrix4()
const tmpQ = new THREE.Quaternion()
const tmpP = new THREE.Vector3()
const tmpS = new THREE.Vector3()
const yAxis = new THREE.Vector3(0, 1, 0)

/**
 * Fills the store with the selected supermarket's catalogue.
 *
 * Shelves show each product's real picture (the photo the supermarket
 * uploaded, or generated packaging art until they do) as cut-out "photo
 * cards" packed into one texture atlas, faced up in rows with a yellow price
 * tag on the shelf edge, like a real aisle. Produce bins and chest freezers
 * keep 3D package geometry. Everything is instanced (one card mesh per store
 * section), and each instance maps back to its product id for picking.
 */
export class ProductInstancer {
  readonly group = new THREE.Group()
  readonly pickables: THREE.InstancedMesh[] = []
  readonly locations = new Map<string, ProductLocation>()

  private geometries: Record<ProductShape, ShapeGeometry> = createShapeGeometries()
  private bodyMaterial = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.02 })
  private labelMaterial = new THREE.MeshStandardMaterial({ roughness: 0.75 })
  private highlight: THREE.LineSegments
  private atlas: ProductAtlas | null = null
  /** Unit card: 1x1 plane standing on y=0, on the FRONT face (z=+0.5) of its footprint box. */
  private cardGeometry = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0.5)
  private buildToken = 0

  constructor() {
    this.group.name = 'products'
    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0))
    this.highlight = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: '#E1C987', depthTest: false, transparent: true }),
    )
    this.highlight.renderOrder = 10
    this.highlight.visible = false
    this.highlight.matrixAutoUpdate = false
    this.group.add(this.highlight)
  }

  /**
   * (Re)stock every slot from the live catalogue. Async because uploaded photos
   * are decoded from IndexedDB; a newer call supersedes one still in flight.
   */
  async build(slots: ProductSlot[], depthRows: number, maxAnisotropy = 4, promos?: ShelfPromos) {
    const token = ++this.buildToken
    const rand = mulberry32(20260)
    const cursors = new Map<CategoryId, number>()
    const placements: Placement[] = []
    const onShelves = new Map<string, Product>()

    for (const slot of slots) {
      // Out-of-stock items leave the shelf (they stay visible in the catalogue).
      const inCategory = productsInCategory(slot.categoryId).filter((p) => p.stock !== 0)
      const candidates = slot.productId
        ? inCategory.filter((p) => p.id === slot.productId)
        : inCategory.filter((p) => !slot.shapes || slot.shapes.includes(p.shape))
      if (!candidates.length) continue

      if (slot.mode === 'bin') this.fillBin(slot, candidates[0]!, rand, placements)
      else if (slot.mode === 'flat') this.fillFlat(slot, candidates, cursors, rand, placements)
      else {
        candidates.forEach((p) => onShelves.set(p.id, p))
        this.fillShelf(slot, candidates, cursors, rand, placements, depthRows)
      }
    }

    const atlas = onShelves.size ? await buildProductAtlas([...onShelves.values()], maxAnisotropy, promos) : null
    if (token !== this.buildToken) {
      atlas?.dispose()
      return
    }
    this.clearMeshes()
    this.atlas = atlas
    for (const pl of placements) this.recordLocation(pl)
    this.createMeshes(placements.filter((p) => !p.card))
    if (atlas) this.createCards(placements.filter((p) => p.card), atlas)
  }

  /** Rows of photo cards, several facings per product, with a price tag under each block. */
  private fillShelf(
    slot: ProductSlot,
    list: Product[],
    cursors: Map<CategoryId, number>,
    rand: () => number,
    out: Placement[],
    depthRows: number,
  ) {
    const gap = 0.004
    let x = -slot.length / 2 + 0.02
    const end = slot.length / 2 - 0.02
    let cursor = cursors.get(slot.categoryId) ?? Math.floor(rand() * list.length)

    while (x < end - 0.05) {
      const product = list[cursor % list.length]!
      cursor++
      const [, rawH, rawD] = productDimensions(product)
      const h = Math.min(rawH, slot.clearance * 0.88)
      const d = Math.min(rawD * (h / rawH), slot.depth * 0.45)
      // Width follows the picture so photos are never stretched (re-measured in createCards).
      const w = h * this.aspectHint(product)
      if (x + w > end) break

      const facings = Math.max(1, Math.min(6, Math.floor(Math.min(end - x, 0.22 + rand() * 0.3) / (w + gap))))
      const rows = Math.max(1, Math.min(depthRows + 1, Math.floor((slot.depth - 0.02) / (d + gap))))
      const stacks = h * 2.1 < slot.clearance ? 2 : 1
      const blockStart = x

      for (let f = 0; f < facings; f++) {
        const px = x + f * (w + gap) + w / 2
        if (px + w / 2 > end) break
        for (let r = 0; r < rows; r++) {
          for (let s = 0; s < stacks; s++) {
            const jitter = (rand() - 0.5) * 0.06
            const pz = -(0.012 + r * (d + gap) + d / 2)
            out.push(this.compose(slot, product, px, s * h, pz, w, h, d, jitter, 'picture'))
          }
        }
      }

      // Shelf-edge price tag at the start of the block.
      const tagW = 0.078
      const tagH = 0.03
      const tagX = Math.min(Math.max(blockStart + tagW / 2, -slot.length / 2 + tagW / 2), slot.length / 2 - tagW / 2)
      out.push(this.compose(slot, product, tagX, -tagH - 0.004, 0.012, tagW, tagH, 0.004, 0, 'tag'))

      x += facings * (w + gap) + 0.012
    }
    cursors.set(slot.categoryId, cursor)
  }

  /** Chest freezers: packages laid in rows (3D geometry, seen from above). */
  private fillFlat(slot: ProductSlot, list: Product[], cursors: Map<CategoryId, number>, rand: () => number, out: Placement[]) {
    const gap = 0.012
    let x = -slot.length / 2 + 0.04
    const end = slot.length / 2 - 0.04
    let cursor = cursors.get(slot.categoryId) ?? Math.floor(rand() * list.length)
    while (x < end - 0.05) {
      const product = list[cursor % list.length]!
      cursor++
      let [w, h, d] = productDimensions(product)
      const fit = Math.min(1, (slot.clearance * 0.9) / h)
      w *= fit
      h *= fit
      d *= fit
      if (x + w > end) break
      const facings = Math.max(1, Math.floor(Math.min(end - x, 0.3 + rand() * 0.35) / (w + gap)))
      const rows = Math.max(1, Math.min(6, Math.floor((slot.depth - 0.04) / (d + gap))))
      for (let f = 0; f < facings; f++) {
        const px = x + f * (w + gap) + w / 2
        if (px + w / 2 > end) break
        for (let r = 0; r < rows; r++) {
          out.push(this.compose(slot, product, px, 0, -(0.03 + r * (d + gap) + d / 2), w, h, d, (rand() - 0.5) * 0.08))
        }
      }
      x += facings * (w + gap) + 0.03
    }
    cursors.set(slot.categoryId, cursor)
  }

  private fillBin(slot: ProductSlot, product: Product, rand: () => number, out: Placement[]) {
    const [w, h, d] = productDimensions(product)
    const isLong = product.shape === 'long'
    const stepX = isLong ? w * 0.95 : w * 0.92
    const stepZ = isLong ? d * 2.2 : d * 0.92
    const nx = Math.max(1, Math.floor(slot.length / stepX))
    const nz = Math.max(1, Math.floor(slot.depth / stepZ))
    const layers = isLong ? 2 : 2
    for (let layer = 0; layer < layers; layer++) {
      const inset = layer * 0.5
      for (let i = 0; i < nx - layer; i++) {
        for (let k = 0; k < nz - layer; k++) {
          const px = -slot.length / 2 + stepX * (i + 0.5 + inset)
          const pz = -(stepZ * (k + 0.5 + inset))
          const py = layer * h * 0.72
          out.push(this.compose(slot, product, px, py, pz, w, h, d, (rand() - 0.5) * (isLong ? 0.5 : 3), undefined, rand() * 0.1))
        }
      }
    }
  }

  private compose(
    slot: ProductSlot,
    product: Product,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    rotY: number,
    card?: Placement['card'],
    tilt = 0,
  ): Placement {
    tmpQ.setFromAxisAngle(yAxis, rotY)
    if (tilt) tmpQ.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), tilt))
    const m = new THREE.Matrix4().compose(tmpP.set(x, y, z), tmpQ, tmpS.set(w, h, d)).premultiply(slot.frame)
    return { product, matrix: m, sectionId: slot.sectionId, card }
  }

  /** The first facing placed becomes the product's "show me where it is" target. */
  private recordLocation(pl: Placement) {
    if (pl.card === 'tag' || this.locations.has(pl.product.id)) return
    pl.matrix.decompose(tmpP, tmpQ, tmpS)
    const position = new THREE.Vector3(0, 1, pl.card ? 0.5 : 0).applyMatrix4(pl.matrix)
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(tmpQ).setY(0).normalize()
    this.locations.set(pl.product.id, { position, normal, categoryId: pl.product.categoryId })
  }

  /** Expected picture aspect before the atlas is ready (uploaded photos are re-measured later). */
  private aspectHint(p: Product) {
    const [w, h] = productDimensions(p)
    if (p.shape === 'round' || p.shape === 'long') return 0.9
    return Math.max(0.25, Math.min(1.6, w / h))
  }

  /** One card mesh per store section: pictures and price tags share the atlas material. */
  private createCards(placements: Placement[], atlas: ProductAtlas) {
    const bySection = new Map<string, Placement[]>()
    for (const p of placements) {
      let list = bySection.get(p.sectionId)
      if (!list) bySection.set(p.sectionId, (list = []))
      list.push(p)
    }
    const widen = new THREE.Matrix4()
    for (const [sectionId, list] of bySection) {
      const geometry = this.cardGeometry.clone()
      const rects = new Float32Array(list.length * 4)
      const mesh = new THREE.InstancedMesh(geometry, atlas.material, list.length)
      mesh.name = `products:${sectionId}:cards`
      const ids: string[] = new Array(list.length)
      list.forEach((pl, i) => {
        const region = pl.card === 'tag' ? atlas.tags.get(pl.product.id) : atlas.pictures.get(pl.product.id)
        if (region && pl.card === 'picture') {
          // An uploaded photo may be wider or narrower than planned: keep it unstretched (capped so it can't swamp neighbours).
          const ratio = region.aspect / this.aspectHint(pl.product)
          if (Math.abs(ratio - 1) > 0.01) pl.matrix.multiply(widen.makeScale(Math.min(1.25, ratio), Math.min(1, 1.25 / ratio), 1))
        }
        mesh.setMatrixAt(i, pl.matrix)
        if (region) region.uv.toArray(rects, i * 4)
        ids[i] = pl.product.id
      })
      geometry.setAttribute('uvRect', new THREE.InstancedBufferAttribute(rects, 4))
      mesh.userData.productIds = ids
      mesh.userData.ownGeometry = true
      mesh.instanceMatrix.needsUpdate = true
      mesh.computeBoundingSphere()
      mesh.computeBoundingBox()
      mesh.castShadow = false
      mesh.receiveShadow = true
      this.group.add(mesh)
      this.pickables.push(mesh)
    }
  }

  private createMeshes(placements: Placement[]) {
    // One batch per (section, shape): few draw calls, yet off-screen sections are culled.
    const batches = new Map<string, { shape: ProductShape; list: Placement[] }>()
    for (const p of placements) {
      const key = `${p.sectionId}|${p.product.shape}`
      let b = batches.get(key)
      if (!b) batches.set(key, (b = { shape: p.product.shape, list: [] }))
      b.list.push(p)
    }
    const color = new THREE.Color()

    for (const { shape, list } of batches.values()) {
      const geo = this.geometries[shape]
      const parts: [THREE.BufferGeometry, THREE.Material, 'body' | 'label'][] = [[geo.body, this.bodyMaterial, 'body']]
      if (geo.label && SHAPES_WITH_LABELS.includes(shape)) parts.push([geo.label, this.labelMaterial, 'label'])

      for (const [geometry, material, part] of parts) {
        const mesh = new THREE.InstancedMesh(geometry, material, list.length)
        mesh.name = `products:${shape}:${part}`
        const ids: string[] = new Array(list.length)
        list.forEach((pl, i) => {
          mesh.setMatrixAt(i, pl.matrix)
          const isTray = shape === 'tray'
          const hex = part === 'body' ? (isTray ? TRAY_BASE : pl.product.color) : isTray ? pl.product.color : pl.product.accent
          // Slight per-instance variation so fresh produce doesn't look cloned.
          color.set(hex)
          if (shape === 'round' || shape === 'long') color.offsetHSL(0, 0, (Math.sin(i * 12.9898) * 0.5) * 0.06)
          mesh.setColorAt(i, color)
          ids[i] = pl.product.id
        })
        mesh.userData.productIds = ids
        mesh.instanceMatrix.needsUpdate = true
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
        mesh.computeBoundingSphere()
        mesh.computeBoundingBox()
        mesh.castShadow = false
        mesh.receiveShadow = true
        this.group.add(mesh)
        this.pickables.push(mesh)
      }
    }
  }

  /** Shared unit geometry for a package shape (reused for products shown in the cart). */
  geometryFor(shape: ProductShape): ShapeGeometry {
    return this.geometries[shape]
  }

  productIdFor(mesh: THREE.Object3D, instanceId: number): string | null {
    const ids = mesh.userData.productIds as string[] | undefined
    return ids?.[instanceId] ?? null
  }

  setHighlight(mesh: THREE.InstancedMesh | null, instanceId = -1) {
    if (!mesh || instanceId < 0) {
      this.highlight.visible = false
      return
    }
    mesh.getMatrixAt(instanceId, tmpM)
    tmpM.decompose(tmpP, tmpQ, tmpS)
    tmpS.multiplyScalar(1.12)
    tmpP.y -= tmpS.y * 0.04
    this.highlight.matrix.compose(tmpP, tmpQ, tmpS)
    this.highlight.visible = true
  }

  private clearMeshes() {
    for (const mesh of this.pickables) {
      this.group.remove(mesh)
      if (mesh.userData.ownGeometry) mesh.geometry.dispose()
      mesh.dispose()
    }
    this.pickables.length = 0
    this.locations.clear()
    this.highlight.visible = false
    this.atlas?.dispose()
    this.atlas = null
  }

  dispose() {
    this.buildToken++
    this.clearMeshes()
    this.cardGeometry.dispose()
    for (const g of Object.values(this.geometries)) {
      g.body.dispose()
      g.label?.dispose()
    }
    this.bodyMaterial.dispose()
    this.labelMaterial.dispose()
    this.highlight.geometry.dispose()
    ;(this.highlight.material as THREE.Material).dispose()
  }
}
