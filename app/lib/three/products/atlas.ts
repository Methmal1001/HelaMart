import * as THREE from 'three'
import type { Product } from '~/types'
import { priceTagCanvas, productArtCanvas, promoTagCanvas } from '../../productArt'
import { loadImageSource } from '~/services/mock/mediaStore'
import { formatLKR } from '~/utils/currency'

/**
 * Packs every product picture (uploaded photo, or generated artwork) and its
 * shelf price tag into ONE texture. Shelf items are flat "photo cards" drawn
 * from this atlas by a single instanced material — thousands of real-looking
 * packs in a handful of draw calls.
 */

export interface AtlasRegion {
  /** UV rect: x, y (bottom-left), width, height. */
  uv: THREE.Vector4
  /** Picture width / height (cut-out photos keep their own proportions). */
  aspect: number
}

export interface ProductAtlas {
  texture: THREE.CanvasTexture
  pictures: Map<string, AtlasRegion>
  tags: Map<string, AtlasRegion>
  material: THREE.MeshStandardMaterial
  dispose(): void
}

type Source = CanvasImageSource & { width: number; height: number }

async function pictureFor(p: Product): Promise<{ src: Source; photo: boolean }> {
  if (p.image) {
    const bitmap = await loadImageSource(p.image)
    if (bitmap) return { src: bitmap, photo: true }
  }
  return { src: productArtCanvas(p), photo: false }
}

/** Shelf-pack rectangles of fixed height into a square canvas. */
function pack(items: { key: string; w: number; h: number }[], size: number) {
  const out = new Map<string, { x: number; y: number; w: number; h: number }>()
  const PAD = 4
  let x = PAD
  let y = PAD
  let rowH = 0
  for (const it of items) {
    if (x + it.w + PAD > size) {
      x = PAD
      y += rowH + PAD
      rowH = 0
    }
    if (y + it.h + PAD > size) return null
    out.set(it.key, { x, y, w: it.w, h: it.h })
    x += it.w + PAD
    rowH = Math.max(rowH, it.h)
  }
  return out
}

/** Products on promotion get a red "special" shelf tag instead of the yellow one. */
export type ShelfPromos = Map<string, { badge: string; nowCents?: number }>

export async function buildProductAtlas(products: Product[], maxAnisotropy: number, promos?: ShelfPromos): Promise<ProductAtlas> {
  const sources = new Map<string, Source>()
  await Promise.all(
    products.map(async (p) => {
      sources.set(p.id, (await pictureFor(p)).src)
    }),
  )
  const tagCanvases = new Map(
    products.map((p) => {
      const promo = promos?.get(p.id)
      if (!promo) return [p.id, priceTagCanvas(p, formatLKR(p.priceCents))] as const
      return [p.id, promo.nowCents ? promoTagCanvas(p, promo.badge, formatLKR(promo.nowCents), formatLKR(p.priceCents)) : promoTagCanvas(p, promo.badge, formatLKR(p.priceCents))] as const
    }),
  )

  // Try progressively smaller cells until everything fits a 2048² (or 4096²) atlas.
  const size = products.length > 140 ? 4096 : 2048
  let layout: ReturnType<typeof pack> = null
  for (let cellH = 224; cellH >= 48 && !layout; cellH -= 16) {
    const items = [
      ...products.map((p) => {
        const s = sources.get(p.id)!
        return { key: `p:${p.id}`, w: Math.max(16, Math.round((cellH * s.width) / s.height)), h: cellH }
      }),
      ...products.map((p) => ({ key: `t:${p.id}`, w: Math.round(cellH * 0.6), h: Math.round(cellH * 0.225) })),
    ].sort((a, b) => b.h - a.h)
    layout = pack(items, size)
  }
  if (!layout) throw new Error('Too many products for the shelf atlas')

  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  const pictures = new Map<string, AtlasRegion>()
  const tags = new Map<string, AtlasRegion>()
  const toUv = (r: { x: number; y: number; w: number; h: number }) => new THREE.Vector4(r.x / size, 1 - (r.y + r.h) / size, r.w / size, r.h / size)

  for (const p of products) {
    const pr = layout.get(`p:${p.id}`)!
    const src = sources.get(p.id)!
    ctx.drawImage(src, pr.x, pr.y, pr.w, pr.h)
    pictures.set(p.id, { uv: toUv(pr), aspect: src.width / src.height })
    const tr = layout.get(`t:${p.id}`)!
    ctx.drawImage(tagCanvases.get(p.id)!, tr.x, tr.y, tr.w, tr.h)
    tags.set(p.id, { uv: toUv(tr), aspect: tr.w / tr.h })
  }
  for (const s of sources.values()) if ('close' in s && typeof s.close === 'function') s.close()

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = maxAnisotropy
  texture.generateMipmaps = true
  texture.minFilter = THREE.LinearMipmapLinearFilter

  const material = new THREE.MeshStandardMaterial({
    map: texture,
    alphaTest: 0.45,
    roughness: 0.5,
    metalness: 0,
    side: THREE.DoubleSide,
    emissive: '#ffffff',
    emissiveMap: texture,
    emissiveIntensity: 0.12,
  })
  // Each instance reads its own atlas region from the `uvRect` attribute.
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 uvRect;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvec2 atlasUv = uvRect.xy + uv * uvRect.zw;\n#ifdef USE_MAP\nvMapUv = atlasUv;\n#endif\n#ifdef USE_EMISSIVEMAP\nvEmissiveMapUv = atlasUv;\n#endif')
  }
  material.customProgramCacheKey = () => 'helamart-atlas-card'

  return {
    texture,
    pictures,
    tags,
    material,
    dispose() {
      texture.dispose()
      material.dispose()
    },
  }
}
