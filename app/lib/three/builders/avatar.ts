import * as THREE from 'three'
import type { AvatarKind } from '~/types'
import { blobShadowTexture } from '../textures'

interface Palette {
  skin: string
  hair: string
  top: string
  bottom: string
  shoes: string
  trim: string
}

const PALETTES: Record<AvatarKind, Palette> = {
  male: { skin: '#A8714F', hair: '#1D1814', top: '#2F6E8F', bottom: '#3A3E48', shoes: '#2A2421', trim: '#E1C987' },
  female: { skin: '#B07A56', hair: '#1A1411', top: '#9E3A5A', bottom: '#EDE4D3', shoes: '#5A3A2A', trim: '#E1C987' },
}

/**
 * Procedural, stylised shopper character with walk / idle / wave / push-cart
 * poses. Built from primitives so no external model is required; a rigged
 * GLTF character can replace `buildBody` later without changing the API.
 */
export class Avatar {
  readonly kind: AvatarKind
  readonly group = new THREE.Group()
  private body = new THREE.Group()
  private legL = new THREE.Group()
  private legR = new THREE.Group()
  private armL = new THREE.Group()
  private armR = new THREE.Group()
  private ring: THREE.Mesh
  private phase = 0
  private amp = 0
  private waveTime = 0
  private t = Math.random() * 10
  pushing = false

  constructor(kind: AvatarKind) {
    this.kind = kind
    this.group.name = `avatar:${kind}`
    this.group.userData.avatarKind = kind
    this.buildBody(PALETTES[kind])

    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 0.9),
      new THREE.MeshBasicMaterial({ map: blobShadowTexture(), transparent: true, depthWrite: false }),
    )
    shadow.rotation.x = -Math.PI / 2
    shadow.position.y = 0.075
    this.group.add(shadow)

    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.42, 0.5, 48),
      new THREE.MeshBasicMaterial({ color: '#E1C987', transparent: true, opacity: 0.95, depthWrite: false }),
    )
    this.ring.rotation.x = -Math.PI / 2
    this.ring.position.y = 0.08
    this.ring.visible = false
    this.group.add(this.ring)
    this.group.add(this.body)
  }

  private buildBody(p: Palette) {
    const mat = (color: string, roughness = 0.75) => new THREE.MeshStandardMaterial({ color, roughness })
    const skin = mat(p.skin, 0.6)
    const hair = mat(p.hair, 0.55)
    const top = mat(p.top)
    const bottom = mat(p.bottom)
    const shoes = mat(p.shoes, 0.5)
    const trim = new THREE.MeshStandardMaterial({ color: p.trim, roughness: 0.35, metalness: 0.4 })
    const female = this.kind === 'female'
    const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
      const mesh = new THREE.Mesh(geo, m)
      mesh.position.set(x, y, z)
      mesh.castShadow = true
      parent.add(mesh)
      return mesh
    }

    const hipY = female ? 0.86 : 0.9
    // Legs (pivot at the hip).
    for (const [leg, x] of [
      [this.legL, 0.09],
      [this.legR, -0.09],
    ] as const) {
      leg.position.set(x, hipY, 0)
      add(leg, new THREE.CapsuleGeometry(female ? 0.065 : 0.075, hipY - 0.2, 4, 10), bottom, 0, -(hipY - 0.06) / 2)
      add(leg, new THREE.BoxGeometry(0.11, 0.07, 0.25), shoes, 0, -hipY + 0.06, 0.04)
      this.body.add(leg)
    }
    add(this.body, new THREE.BoxGeometry(0.32, 0.16, 0.2), bottom, 0, hipY + 0.04)

    if (female) {
      // Kurta-style tunic flaring to the knee, with a gold hem.
      add(this.body, new THREE.CylinderGeometry(0.15, 0.25, 0.72, 18), top, 0, 1.0)
      add(this.body, new THREE.CylinderGeometry(0.252, 0.255, 0.04, 18), trim, 0, 0.66)
      add(this.body, new THREE.CapsuleGeometry(0.15, 0.16, 4, 12), top, 0, 1.3).scale.set(1.05, 1, 0.78)
      add(this.body, new THREE.TorusGeometry(0.085, 0.012, 6, 18), trim, 0, 1.43, 0.035).rotation.x = Math.PI / 2.4
    } else {
      add(this.body, new THREE.CapsuleGeometry(0.17, 0.3, 4, 12), top, 0, 1.22).scale.set(1.12, 1, 0.74)
      // Collar.
      add(this.body, new THREE.CylinderGeometry(0.075, 0.09, 0.05, 12), top, 0, 1.45)
    }

    const neckY = female ? 1.46 : 1.48
    add(this.body, new THREE.CylinderGeometry(0.048, 0.052, 0.1, 10), skin, 0, neckY)
    const headY = neckY + 0.15
    const head = add(this.body, new THREE.SphereGeometry(0.115, 20, 16), skin, 0, headY)
    head.scale.set(0.92, 1.06, 0.98)
    for (const x of [0.04, -0.04]) add(this.body, new THREE.SphereGeometry(0.014, 8, 8), mat('#1A1410', 0.3), x, headY + 0.015, 0.1)
    add(this.body, new THREE.BoxGeometry(0.045, 0.008, 0.01), mat('#7A3E32', 0.6), 0, headY - 0.045, 0.106)
    // Hair.
    const cap = add(
      this.body,
      new THREE.SphereGeometry(0.124, 20, 12, 0, Math.PI * 2, 0, female ? Math.PI * 0.58 : Math.PI * 0.5),
      hair,
      0,
      headY + 0.012,
      -0.008,
    )
    cap.scale.set(0.96, 1.08, 1.02)
    // Tilt the hairline back so the forehead and eyes stay visible.
    cap.rotation.x = -0.5
    if (female) {
      add(this.body, new THREE.CapsuleGeometry(0.085, 0.3, 4, 10), hair, 0, headY - 0.2, -0.08).scale.set(1.25, 1, 0.6)
      add(this.body, new THREE.SphereGeometry(0.07, 12, 10), hair, 0, headY + 0.02, -0.12)
    } else {
      add(this.body, new THREE.BoxGeometry(0.2, 0.06, 0.08), hair, 0, headY + 0.07, 0.06).rotation.x = -0.4
    }

    // Arms (pivot at the shoulder).
    const shoulderY = female ? 1.38 : 1.4
    for (const [arm, x] of [
      [this.armL, 0.215],
      [this.armR, -0.215],
    ] as const) {
      arm.position.set(x, shoulderY, 0)
      add(arm, new THREE.CapsuleGeometry(0.045, 0.46, 4, 10), skin, 0, -0.28)
      add(arm, new THREE.CapsuleGeometry(0.06, female ? 0.26 : 0.14, 4, 10), top, 0, female ? -0.15 : -0.08)
      add(arm, new THREE.SphereGeometry(0.05, 10, 8), skin, 0, -0.58)
      this.body.add(arm)
    }
  }

  setSelected(selected: boolean) {
    this.ring.visible = selected
  }

  wave() {
    this.waveTime = 1.8
  }

  /** speed in m/s drives the walk cycle. */
  update(dt: number, speed: number) {
    this.t += dt
    const targetAmp = Math.min(1, speed / 1.6)
    this.amp += (targetAmp - this.amp) * Math.min(1, dt * 8)
    this.phase += dt * (3 + speed * 2.6)
    const s = Math.sin(this.phase)

    this.legL.rotation.x = s * 0.55 * this.amp
    this.legR.rotation.x = -s * 0.55 * this.amp
    this.body.position.y = Math.abs(Math.cos(this.phase)) * 0.035 * this.amp + Math.sin(this.t * 2) * 0.004

    if (this.pushing) {
      const reach = -1.15 + s * 0.04 * this.amp
      this.armL.rotation.set(reach, 0, 0.12)
      this.armR.rotation.set(reach, 0, -0.12)
    } else {
      this.armL.rotation.set(-s * 0.45 * this.amp, 0, 0.06)
      this.armR.rotation.set(s * 0.45 * this.amp, 0, -0.06)
    }

    if (this.waveTime > 0) {
      this.waveTime -= dt
      const k = Math.min(1, this.waveTime / 0.3, (1.8 - this.waveTime) / 0.3)
      this.armR.rotation.set(0, 0, -0.06 - k * (2.5 + Math.sin(this.t * 14) * 0.25))
    }

    if (this.ring.visible) {
      const pulse = 1 + Math.sin(this.t * 3) * 0.05
      this.ring.scale.set(pulse, pulse, pulse)
    }
  }
}
