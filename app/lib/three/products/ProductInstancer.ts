import * as THREE from 'three'
import type { CategoryId, Product, ProductShape } from '~/types'
import { productsInCategory } from '~/data/products'
import { createShapeGeometries, productDimensions, SHAPES_WITH_LABELS, type ShapeGeometry } from './shapes'

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
 * Fills shelf slots with products from the mock catalogue using one
 * InstancedMesh per package shape (+ one for labels): thousands of products in
 * ~20 draw calls. Each instance maps back to its product id for picking.
 */
export class ProductInstancer {
  readonly group = new THREE.Group()
  readonly pickables: THREE.InstancedMesh[] = []
  readonly locations = new Map<string, ProductLocation>()

  private geometries: Record<ProductShape, ShapeGeometry> = createShapeGeometries()
  private bodyMaterial = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.02 })
  private labelMaterial = new THREE.MeshStandardMaterial({ roughness: 0.75 })
  private highlight: THREE.LineSegments

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

  build(slots: ProductSlot[], depthRows: number) {
    this.clearMeshes()
    const rand = mulberry32(20260)
    const cursors = new Map<CategoryId, number>()
    const placements: Placement[] = []

    for (const slot of slots) {
      const candidates = slot.productId
        ? productsInCategory(slot.categoryId).filter((p) => p.id === slot.productId)
        : productsInCategory(slot.categoryId).filter((p) => !slot.shapes || slot.shapes.includes(p.shape))
      if (!candidates.length) continue

      if (slot.mode === 'bin') this.fillBin(slot, candidates[0]!, rand, placements)
      else this.fillShelf(slot, candidates, cursors, rand, placements, slot.mode === 'flat' ? 6 : depthRows)
    }

    this.createMeshes(placements)
  }

  private fillShelf(
    slot: ProductSlot,
    list: Product[],
    cursors: Map<CategoryId, number>,
    rand: () => number,
    out: Placement[],
    depthRows: number,
  ) {
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

      const blockWidth = Math.min(end - x, 0.3 + rand() * 0.35)
      const facings = Math.max(1, Math.floor(blockWidth / (w + gap)))
      if (x + w > end) break
      const rows = Math.max(1, Math.min(depthRows, Math.floor((slot.depth - 0.04) / (d + gap))))
      const stacks = slot.mode === 'shelf' && h * 2.15 < slot.clearance ? 2 : 1

      for (let f = 0; f < facings; f++) {
        const px = x + f * (w + gap) + w / 2
        if (px + w / 2 > end) break
        for (let r = 0; r < rows; r++) {
          for (let s = 0; s < stacks; s++) {
            const jitter = (rand() - 0.5) * 0.08
            this.place(slot, product, px, s * h, -(0.03 + r * (d + gap) + d / 2), w, h, d, jitter, out)
          }
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
          this.place(slot, product, px, py, pz, w, h, d, (rand() - 0.5) * (isLong ? 0.5 : 3), out, rand() * 0.1)
        }
      }
    }
  }

  private place(
    slot: ProductSlot,
    product: Product,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    rotY: number,
    out: Placement[],
    tilt = 0,
  ) {
    tmpQ.setFromAxisAngle(yAxis, rotY)
    if (tilt) tmpQ.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), tilt))
    const m = new THREE.Matrix4().compose(tmpP.set(x, y, z), tmpQ, tmpS.set(w, h, d)).premultiply(slot.frame)
    out.push({ product, matrix: m, sectionId: slot.sectionId })

    if (!this.locations.has(product.id)) {
      const position = new THREE.Vector3(x, y + h, z).applyMatrix4(slot.frame)
      const normal = new THREE.Vector3(0, 0, 1).transformDirection(slot.frame).setY(0).normalize()
      this.locations.set(product.id, { position, normal, categoryId: product.categoryId })
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
      mesh.dispose()
    }
    this.pickables.length = 0
    this.locations.clear()
    this.highlight.visible = false
  }

  dispose() {
    this.clearMeshes()
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
