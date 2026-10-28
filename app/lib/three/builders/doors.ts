import * as THREE from 'three'
import { STORE } from '~/data/storeLayout'
import type { MaterialLibrary } from '../materials'
import { doorDecalTexture } from '../textures'

const smooth = (t: number) => t * t * (3 - 2 * t)

/**
 * Sensor-operated sliding entrance doors. Opens whenever someone stands in the
 * sensor zone, then holds open for a realistic interval before closing.
 */
export class AutoDoors {
  readonly group = new THREE.Group()
  private left = new THREE.Group()
  private right = new THREE.Group()
  private led: THREE.MeshStandardMaterial
  private progress = 0
  private hold = 0
  private readonly panelW = STORE.door.width / 2
  /** Seconds the doors stay open after the sensor zone is clear. */
  holdTime = 2.2
  openDuration = 1.15

  constructor(materials: MaterialLibrary) {
    const H = STORE.door.height
    const W = this.panelW
    const frame = materials.color('#B7BEC0', 0.3, 0.75)
    const glass = materials.glass('door-glass', 0.2, '#CFE6E0')
    const gold = materials.color('#E1C987', 0.3, 0.6)
    const decal = new THREE.MeshBasicMaterial({ map: doorDecalTexture(), transparent: true, depthWrite: false })

    const panel = (sign: number) => {
      const g = new THREE.Group()
      const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z = 0) => {
        const mesh = new THREE.Mesh(geo, mat)
        mesh.position.set(x, y, z)
        mesh.castShadow = mat !== glass
        g.add(mesh)
        return mesh
      }
      add(new THREE.BoxGeometry(0.06, H, 0.06), frame, -W / 2 + 0.03, H / 2)
      add(new THREE.BoxGeometry(0.06, H, 0.06), frame, W / 2 - 0.03, H / 2)
      add(new THREE.BoxGeometry(W, 0.1, 0.06), frame, 0, H - 0.05)
      add(new THREE.BoxGeometry(W, 0.14, 0.06), frame, 0, 0.07)
      add(new THREE.BoxGeometry(W - 0.1, H - 0.22, 0.015), glass, 0, H / 2 + 0.01)
      // Handles on the meeting edge, both faces.
      const handleX = -sign * (W / 2 - 0.16)
      for (const z of [0.06, -0.06]) add(new THREE.CylinderGeometry(0.016, 0.016, 0.62, 10), gold, handleX, 1.1, z)
      const d = add(new THREE.PlaneGeometry(0.9, 0.22), decal, 0, 1.55, 0.012)
      d.castShadow = false
      return g
    }

    this.left.add(panel(-1))
    this.right.add(panel(1))
    this.left.position.set(-W / 2, 0, -0.04)
    this.right.position.set(W / 2, 0, -0.04)
    this.group.add(this.left, this.right)

    // Fixed side lites the doors slide behind.
    for (const s of [-1, 1]) {
      const lite = panel(s)
      lite.position.set(s * (W + W / 2), 0, 0.07)
      lite.children.filter((c) => (c as THREE.Mesh).geometry instanceof THREE.CylinderGeometry || (c as THREE.Mesh).material === decal).forEach((c) => (c.visible = false))
      this.group.add(lite)
    }

    // Header with motion sensor.
    const header = new THREE.Mesh(new THREE.BoxGeometry(STORE.door.width * 2 + 0.1, 0.16, 0.34), frame)
    header.position.set(0, H + 0.08, 0)
    this.group.add(header)
    const sensor = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.07, 0.1), materials.color('#22282B', 0.4))
    sensor.position.set(0, H - 0.02, 0.2)
    this.group.add(sensor)
    this.led = new THREE.MeshStandardMaterial({ color: '#6BD69A', emissive: '#6BD69A', emissiveIntensity: 0.4 })
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 8), this.led)
    led.position.set(0.12, H - 0.05, 0.26)
    this.group.add(led)
    this.group.position.set(STORE.door.x, 0, 0)
  }

  /** 0 = closed, 1 = fully open. */
  get openAmount() {
    return smooth(this.progress)
  }

  update(dt: number, people: THREE.Vector3[]) {
    const detected = people.some((p) => Math.abs(p.x - STORE.door.x) < 2.6 && p.z > -2.6 && p.z < 3.4)
    if (detected) this.hold = this.holdTime
    else this.hold = Math.max(0, this.hold - dt)
    const target = this.hold > 0 ? 1 : 0
    const step = dt / this.openDuration
    this.progress = target > this.progress ? Math.min(1, this.progress + step) : Math.max(0, this.progress - step * 0.8)
    const offset = this.openAmount * (this.panelW - 0.08)
    this.left.position.x = -this.panelW / 2 - offset
    this.right.position.x = this.panelW / 2 + offset
    this.led.emissiveIntensity = detected ? 2.2 : 0.4
  }

  /** Jump straight to a state (reduced motion / spawning inside). */
  snap(open: boolean) {
    this.progress = open ? 1 : 0
    this.hold = open ? this.holdTime : 0
    this.update(0, [])
  }
}
