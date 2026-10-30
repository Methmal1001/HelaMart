import * as THREE from 'three'
import { getSection, sectionColor, sectionTitle } from '~/data/storeLayout'
import { sectionSignTexture } from './textures'
import type { SignSpot } from './builders/shell'

/**
 * Faces of the hanging aisle signs and back-wall section signs, drawn from
 * the chosen supermarket's own categories (their names and colours), and
 * redrawn whenever the supermarket changes them. Frames and cables are part
 * of the static store shell.
 */
export class SectionSignsLayer {
  readonly group = new THREE.Group()
  private owned: { dispose(): void }[] = []

  constructor(
    private spots: SignSpot[],
    private maxAnisotropy: number,
  ) {
    this.group.name = 'section-signs'
  }

  apply() {
    this.clear()
    const textures = new Map<string, THREE.Texture>()
    for (const spot of this.spots) {
      const s = getSection(spot.sectionId)
      if (!s) continue
      let tex = textures.get(s.id)
      if (!tex) {
        const title = s.kind === 'checkout' ? 'Checkout' : sectionTitle(s)
        tex = sectionSignTexture(title, s.aisle?.replace('Aisle ', 'A'), s.kind === 'checkout' ? s.color : sectionColor(s))
        tex.anisotropy = this.maxAnisotropy
        textures.set(s.id, tex)
        this.owned.push(tex)
      }
      // Backlit panels: crisp, true-colour text from anywhere in the store.
      const material = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })
      const geometry = new THREE.PlaneGeometry(spot.w, spot.w / 4)
      this.owned.push(material, geometry)
      const front = new THREE.Mesh(geometry, material)
      front.position.set(spot.x, spot.y, spot.z + 0.02)
      this.group.add(front)
      if (spot.doubleSided) {
        const back = new THREE.Mesh(geometry, material)
        back.position.set(spot.x, spot.y, spot.z - 0.02)
        back.rotation.y = Math.PI
        this.group.add(back)
      }
    }
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
