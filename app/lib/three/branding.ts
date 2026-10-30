import * as THREE from 'three'
import type { BrandingProfile } from '~/types/admin'
import { GONDOLA, GONDOLA_X, STORE } from '~/data/storeLayout'
import { accentFor, shadeHex } from '../branding'
import { checkoutBoardCanvas, decodeImage, logoPlateCanvas, promoBannerCanvas, storeBannerCanvas, type BrandImages } from '../brandingArt'
import { BRAND_DEFAULTS, type MaterialLibrary } from './materials'

export interface StoreBranding {
  name: string
  profile: BrandingProfile
}

/** Where promotional banners hang on the side walls (Premium). */
const PROMO_SPOTS = [
  { x: STORE.minX + 0.04, z: -21, rotY: Math.PI / 2 },
  { x: STORE.maxX - 0.04, z: -21, rotY: -Math.PI / 2 },
  { x: STORE.minX + 0.04, z: -30, rotY: Math.PI / 2 },
]

/**
 * The selected supermarket's presence inside the HelaMart store.
 *
 *  - recolours the theme materials (rack bases & top bands, checkout counters,
 *    wall trims, bakery awning) — HelaMart's entrance, storefront sign and UI
 *    keep HelaMart's own colours
 *  - hangs a welcome banner inside the entrance and a fascia board over the
 *    checkout lanes with the supermarket's logo, name and slogan
 *  - Premium: logo plates on every aisle end-cap and promotional wall banners
 *
 * Only HelaMart-approved branding ever reaches this layer.
 */
export class BrandingLayer {
  readonly group = new THREE.Group()
  private token = 0
  private owned: { geometry: THREE.BufferGeometry; material?: THREE.Material; texture?: THREE.Texture }[] = []

  constructor(
    private materials: MaterialLibrary,
    private maxAnisotropy: number,
  ) {
    this.group.name = 'supermarket-branding'
  }

  async apply(branding: StoreBranding | null) {
    const token = ++this.token
    this.applyColours(branding?.profile ?? null)
    if (!branding) {
      this.clear()
      return
    }
    const { profile: p, name } = branding
    const [logo, banner, ...promos] = await Promise.all([decodeImage(p.logo), decodeImage(p.banner), ...p.promoBanners.map((b) => decodeImage(b))])
    if (token !== this.token) return
    await document.fonts?.ready
    if (token !== this.token) return

    this.clear()
    const imgs: BrandImages = { logo, banner }

    // Welcome banner inside the entrance, readable from both directions.
    const bannerTex = this.texture(storeBannerCanvas(p, name, imgs))
    // Hung over the main walkway, high enough to keep the aisle signs behind it in view.
    const bz = -8.5
    const by = 3.55
    for (const back of [false, true]) this.plane(bannerTex, 4.5, 1.8, new THREE.Vector3(0, by, bz + (back ? -0.02 : 0.02)), back ? Math.PI : 0, back)
    this.box(4.56, 1.86, 0.03, new THREE.Vector3(0, by, bz))
    for (const s of [-1, 1]) this.cable(new THREE.Vector3(s * 1.9, by + 0.93, bz), STORE.height - by - 0.93)

    // Fascia board over the checkout lanes, facing shoppers inside the store.
    const board = checkoutBoardCanvas(p, name, imgs)
    const boardW = 12.4
    const boardH = (boardW * board.height) / board.width
    this.plane(this.texture(board), boardW, boardH, new THREE.Vector3(12.25, 3.2, -2.62), Math.PI)
    this.box(boardW + 0.08, boardH + 0.08, 0.05, new THREE.Vector3(12.25, 3.2, -2.58))

    if (p.logoOnFixtures) {
      const plateTex = this.texture(logoPlateCanvas(p, name, imgs))
      const front = GONDOLA.zStart + 0.08
      const back = GONDOLA.zEnd - 0.08
      for (const x of GONDOLA_X) {
        this.plane(plateTex, 0.62, 0.62, new THREE.Vector3(x, 1.55, front), 0)
        this.plane(plateTex, 0.62, 0.62, new THREE.Vector3(x, 1.55, back), Math.PI)
      }
    }

    promos.forEach((img, i) => {
      const spot = PROMO_SPOTS[i]
      if (!img || !spot) return
      const c = promoBannerCanvas(p, img)
      this.plane(this.texture(c), 4.6, (4.6 * c.height) / c.width, new THREE.Vector3(spot.x, 2.55, spot.z), spot.rotY)
      img.close()
    })
    logo?.close()
    banner?.close()
  }

  private applyColours(p: BrandingProfile | null) {
    const primary = p?.primaryColor ?? BRAND_DEFAULTS.primary
    this.materials.brand('primary').color.set(primary)
    this.materials.brand('accent').color.set(p ? accentFor(p) : BRAND_DEFAULTS.accent)
    this.materials.brand('rackBase').color.set(p ? shadeHex(primary, -0.45) : BRAND_DEFAULTS.rackBase)
  }

  private texture(c: HTMLCanvasElement) {
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = this.maxAnisotropy
    return t
  }

  private plane(texture: THREE.Texture, w: number, h: number, pos: THREE.Vector3, rotY: number, sharedTexture = false) {
    // Backlit signage: unlit and not tone-mapped, so the supermarket's colours show exactly as designed.
    const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false })
    const geometry = new THREE.PlaneGeometry(w, h)
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.copy(pos)
    mesh.rotation.y = rotY
    this.group.add(mesh)
    // Several planes may share one texture: only the first owner disposes it.
    this.owned.push({ geometry, material, texture: sharedTexture ? undefined : texture })
    return mesh
  }

  private box(w: number, h: number, d: number, pos: THREE.Vector3) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.materials.brand('primary'))
    mesh.position.copy(pos)
    this.group.add(mesh)
    this.owned.push({ geometry: mesh.geometry })
  }

  private cable(top: THREE.Vector3, len: number) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.012, len, 0.012), this.materials.color('#8A918D', 0.4, 0.6))
    mesh.position.set(top.x, top.y + len / 2, top.z)
    this.group.add(mesh)
    this.owned.push({ geometry: mesh.geometry })
  }

  private clear() {
    for (const o of this.owned) {
      o.geometry.dispose()
      o.material?.dispose()
      o.texture?.dispose()
    }
    this.owned = []
    this.group.clear()
  }

  dispose() {
    this.token++
    this.clear()
  }
}
