import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { ISLAND_OUTLINE, districtCentre } from '~/data/places'
import { DISTRICTS } from '~/data/sriLanka'

/**
 * Interactive 3D map of Sri Lanka for finding supermarkets by area.
 * The island is extruded from its outline (1 unit ≈ 10 km), every verified
 * branch is a pin in its supermarket's colour, and the chosen area shows as a
 * glowing radius ring. Drag to orbit, scroll/pinch to zoom, tap to pick.
 */

export interface MapPin {
  storeId: string
  branchId: string
  lat: number
  lng: number
  color: string
  label: string
}

export interface AreaMapCallbacks {
  onPick: (lat: number, lng: number) => void
  onPinClick: (storeId: string, branchId: string) => void
  onPinHover: (pin: MapPin | null, x: number, y: number) => void
}

const ORIGIN = { lat: 7.87, lng: 80.7 }
const KX = 11.0
const KZ = 11.06
const LAND_TOP = 0.62

export const toWorld = (lat: number, lng: number) => new THREE.Vector3((lng - ORIGIN.lng) * KX, LAND_TOP, -(lat - ORIGIN.lat) * KZ)
const toLatLng = (p: THREE.Vector3) => ({ lat: ORIGIN.lat - p.z / KZ, lng: ORIGIN.lng + p.x / KX })
const kmToUnits = (km: number) => km / 10

function labelSprite(text: string, opts: { size?: number; color?: string; bg?: string; weight?: number; screen?: number } = {}) {
  const size = opts.size ?? 44
  const c = document.createElement('canvas')
  const ctx = c.getContext('2d')!
  const font = `${opts.weight ?? 700} ${size}px 'Plus Jakarta Sans', 'Segoe UI', sans-serif`
  ctx.font = font
  const w = Math.ceil(ctx.measureText(text).width) + size
  c.width = w
  c.height = Math.round(size * 1.6)
  ctx.font = font
  if (opts.bg) {
    ctx.fillStyle = opts.bg
    ctx.beginPath()
    ctx.roundRect(0, 0, c.width, c.height, c.height / 2)
    ctx.fill()
  }
  ctx.fillStyle = opts.color ?? '#ffffff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, c.width / 2, c.height / 2 + 2)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  // Constant on-screen size (fraction of the viewport height), so labels stay readable at any zoom.
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, depthTest: false, transparent: true, sizeAttenuation: false }))
  const h = (opts.screen ?? 0.03)
  sprite.scale.set((h * c.width) / c.height, h, 1)
  return sprite
}

export class AreaMap {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(38, 1, 0.5, 400)
  private controls: OrbitControls
  private island!: THREE.Mesh
  private pins = new THREE.Group()
  private pinMeshes: THREE.Mesh[] = []
  private pinData = new Map<THREE.Object3D, MapPin>()
  private areaGroup = new THREE.Group()
  private ring!: THREE.Mesh
  private pulse!: THREE.Mesh
  private disc!: THREE.Mesh
  private areaLabel: THREE.Sprite | null = null
  private raycaster = new THREE.Raycaster()
  private pointer = new THREE.Vector2()
  private hovered: THREE.Object3D | null = null
  private fly: { from: THREE.Vector3; to: THREE.Vector3; camFrom: THREE.Vector3; camTo: THREE.Vector3; t0: number; ms: number } | null = null
  private down: { x: number; y: number } | null = null
  private raf = 0
  private resizeObserver: ResizeObserver
  private disposables: { dispose(): void }[] = []

  constructor(
    private container: HTMLElement,
    private cb: AreaMapCallbacks,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.shadowMap.enabled = true
    const canvas = this.renderer.domElement
    canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;cursor:grab'
    canvas.setAttribute('aria-hidden', 'true')
    container.appendChild(canvas)

    this.camera.position.set(14, 46, 34)
    this.controls = new OrbitControls(this.camera, canvas)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.minDistance = 7
    this.controls.maxDistance = 80
    this.controls.minPolarAngle = 0.12
    this.controls.maxPolarAngle = 1.2
    this.controls.target.set(0, 0, 0)
    this.controls.screenSpacePanning = false

    this.buildWorld()
    this.scene.add(this.pins, this.areaGroup)

    canvas.addEventListener('pointerdown', this.onDown)
    canvas.addEventListener('pointerup', this.onUp)
    canvas.addEventListener('pointermove', this.onMove)
    canvas.addEventListener('pointerleave', this.onLeave)
    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(container)
    this.resize()
    this.loop()
  }

  // ---------------------------------------------------------------- world

  private buildWorld() {
    this.scene.fog = new THREE.Fog('#0b3a3f', 70, 160)
    this.scene.add(new THREE.HemisphereLight('#fff6e0', '#0d4d52', 1.1))
    const sun = new THREE.DirectionalLight('#fff3d6', 2.1)
    sun.position.set(-25, 40, 18)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 120 })
    this.scene.add(sun)

    // Sea: radial gradient, lighter in the shallows around the island.
    const sc = document.createElement('canvas')
    sc.width = sc.height = 512
    const sctx = sc.getContext('2d')!
    const g = sctx.createRadialGradient(256, 256, 30, 256, 256, 256)
    g.addColorStop(0, '#2f8f95')
    g.addColorStop(0.35, '#1b6d74')
    g.addColorStop(1, '#0b3a3f')
    sctx.fillStyle = g
    sctx.fillRect(0, 0, 512, 512)
    const seaTex = new THREE.CanvasTexture(sc)
    seaTex.colorSpace = THREE.SRGBColorSpace
    const sea = new THREE.Mesh(new THREE.CircleGeometry(150, 64), new THREE.MeshStandardMaterial({ map: seaTex, roughness: 0.35, metalness: 0.1 }))
    sea.rotation.x = -Math.PI / 2
    sea.receiveShadow = true
    this.scene.add(sea)
    this.track(sea.geometry, sea.material as THREE.Material, seaTex)

    // Island, extruded from its outline. Caps green, beaches HelaMart gold.
    const shape = new THREE.Shape(ISLAND_OUTLINE.map(([lat, lng]) => new THREE.Vector2((lng - ORIGIN.lng) * KX, (lat - ORIGIN.lat) * KZ)))
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.5, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.35, bevelSegments: 3, curveSegments: 4 })
    geo.rotateX(-Math.PI / 2)
    const land = new THREE.MeshStandardMaterial({ color: '#5aa36f', roughness: 0.85 })
    const beach = new THREE.MeshStandardMaterial({ color: '#e6cf91', roughness: 0.9 })
    this.island = new THREE.Mesh(geo, [land, beach])
    this.island.castShadow = true
    this.island.receiveShadow = true
    this.scene.add(this.island)
    this.track(geo, land, beach)

    // Central highlands (around Kandy, Nuwara Eliya, Badulla) as soft hills.
    const hillMat = new THREE.MeshStandardMaterial({ color: '#4c955f', roughness: 0.95 })
    const hillGeo = new THREE.SphereGeometry(1, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2)
    this.track(hillMat, hillGeo)
    const hills: [number, number, number, number][] = [
      [6.98, 80.8, 2.6, 0.55], [7.2, 80.7, 1.8, 0.35], [6.86, 80.98, 1.9, 0.4], [6.72, 80.58, 1.6, 0.3], [7.5, 80.78, 1.4, 0.25], [6.45, 80.55, 1.5, 0.22],
    ]
    for (const [lat, lng, r, h] of hills) {
      const hill = new THREE.Mesh(hillGeo, hillMat)
      hill.position.copy(toWorld(lat, lng)).setY(LAND_TOP - 0.05)
      hill.scale.set(r, h, r * 0.9)
      hill.castShadow = true
      hill.receiveShadow = true
      this.scene.add(hill)
    }

    // District names, subtle.
    for (const d of DISTRICTS) {
      const c = districtCentre(d)
      if (!c) continue
      const s = labelSprite(d, { size: 30, color: 'rgba(255,255,255,0.85)', weight: 600, screen: 0.02 })
      s.position.copy(toWorld(c.lat, c.lng)).setY(LAND_TOP + 0.9)
      s.renderOrder = 1
      this.scene.add(s)
      this.track(s.material, s.material.map!)
    }

    // Area marker: filled disc + ring + pulse + "you are here" beacon.
    const gold = '#E1C987'
    this.disc = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.MeshBasicMaterial({ color: gold, transparent: true, opacity: 0.16, depthWrite: false }))
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.97, 1, 96), new THREE.MeshBasicMaterial({ color: gold, transparent: true, opacity: 0.95, depthWrite: false }))
    this.pulse = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 64), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5, depthWrite: false }))
    for (const m of [this.disc, this.ring, this.pulse]) {
      m.rotation.x = -Math.PI / 2
      m.renderOrder = 2
      ;(m.material as THREE.MeshBasicMaterial).depthTest = false
      this.track(m.geometry, m.material as THREE.Material)
    }
    const beaconMat = new THREE.MeshStandardMaterial({ color: '#174D38', emissive: '#174D38', emissiveIntensity: 0.4 })
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.6, 16).translate(0, 0.8, 0), beaconMat)
    const beaconTop = new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 16), new THREE.MeshStandardMaterial({ color: gold, emissive: gold, emissiveIntensity: 0.35, metalness: 0.3, roughness: 0.3 }))
    beaconTop.position.y = 1.85
    beacon.castShadow = beaconTop.castShadow = true
    this.track(beacon.geometry, beaconMat, beaconTop.geometry, beaconTop.material as THREE.Material)
    this.areaGroup.add(this.disc, this.ring, this.pulse, beacon, beaconTop)
    this.areaGroup.visible = false
  }

  private track(...items: { dispose(): void }[]) {
    this.disposables.push(...items)
  }

  // ---------------------------------------------------------------- pins

  setPins(pins: MapPin[]) {
    for (const m of this.pinMeshes) (m.material as THREE.Material).dispose()
    this.pins.clear()
    this.pinMeshes = []
    this.pinData.clear()
    const stem = new THREE.CylinderGeometry(0.05, 0.05, 1.1, 8).translate(0, 0.55, 0)
    const head = new THREE.SphereGeometry(0.34, 20, 14)
    const ringGeo = new THREE.TorusGeometry(0.34, 0.06, 8, 24)
    this.track(stem, head, ringGeo)
    const stemMat = new THREE.MeshStandardMaterial({ color: '#f3efe3', roughness: 0.5 })
    this.track(stemMat)
    for (const p of pins) {
      const g = new THREE.Group()
      g.position.copy(toWorld(p.lat, p.lng))
      const s = new THREE.Mesh(stem, stemMat)
      const mat = new THREE.MeshStandardMaterial({ color: p.color, emissive: p.color, emissiveIntensity: 0.25, roughness: 0.35, metalness: 0.15, transparent: true })
      const h = new THREE.Mesh(head, mat)
      h.position.y = 1.35
      const r = new THREE.Mesh(ringGeo, stemMat)
      r.position.y = 1.35
      r.rotation.x = Math.PI / 2
      s.castShadow = h.castShadow = true
      g.add(s, h, r)
      g.userData.base = 1
      this.pins.add(g)
      this.pinMeshes.push(h)
      this.pinData.set(h, p)
    }
  }

  /** Emphasise pins inside the area; others fade back. */
  setHighlighted(branchIds: Set<string> | null) {
    for (const h of this.pinMeshes) {
      const p = this.pinData.get(h)!
      const on = !branchIds || branchIds.has(p.branchId)
      const mat = h.material as THREE.MeshStandardMaterial
      mat.opacity = on ? 1 : 0.35
      mat.emissiveIntensity = on ? 0.35 : 0.05
      h.parent!.userData.base = on ? 1.15 : 0.75
    }
  }

  // ---------------------------------------------------------------- area

  setArea(area: { lat: number; lng: number; radiusKm: number; label: string } | null, animate = true) {
    if (this.areaLabel) {
      this.areaGroup.remove(this.areaLabel)
      this.areaLabel.material.map?.dispose()
      this.areaLabel.material.dispose()
      this.areaLabel = null
    }
    if (!area) {
      this.areaGroup.visible = false
      return
    }
    const pos = toWorld(area.lat, area.lng)
    this.areaGroup.visible = true
    this.areaGroup.position.set(pos.x, LAND_TOP + 0.03, pos.z)
    const r = kmToUnits(area.radiusKm)
    for (const m of [this.disc, this.ring]) m.scale.set(r, r, 1)
    this.pulse.userData.r = r
    this.areaLabel = labelSprite(area.label, { size: 40, color: '#174D38', bg: '#E1C987', weight: 800, screen: 0.045 })
    this.areaLabel.position.set(0, 2.9, 0)
    this.areaLabel.renderOrder = 3
    this.areaGroup.add(this.areaLabel)

    // Frame the whole radius.
    const dist = Math.max(14, r * 7 + 10)
    const target = new THREE.Vector3(pos.x, 0, pos.z)
    const dir = this.camera.position.clone().sub(this.controls.target).normalize()
    if (dir.y < 0.55) dir.setY(0.75).normalize()
    this.flyTo(target, target.clone().add(dir.multiplyScalar(dist)), animate ? 1100 : 0)
  }

  focus(lat: number, lng: number, distance = 12) {
    const target = toWorld(lat, lng).setY(0)
    const dir = this.camera.position.clone().sub(this.controls.target).normalize()
    this.flyTo(target, target.clone().add(dir.multiplyScalar(distance)), 900)
  }

  overview() {
    this.flyTo(new THREE.Vector3(0, 0, 0), new THREE.Vector3(14, 46, 34), 1000)
  }

  private flyTo(target: THREE.Vector3, cam: THREE.Vector3, ms: number) {
    if (!ms) {
      this.controls.target.copy(target)
      this.camera.position.copy(cam)
      this.fly = null
      return
    }
    this.fly = { from: this.controls.target.clone(), to: target, camFrom: this.camera.position.clone(), camTo: cam, t0: performance.now(), ms }
  }

  // ---------------------------------------------------------------- input

  private setPointer(e: PointerEvent) {
    const r = this.renderer.domElement.getBoundingClientRect()
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    this.raycaster.setFromCamera(this.pointer, this.camera)
  }

  private onDown = (e: PointerEvent) => {
    this.down = { x: e.clientX, y: e.clientY }
    this.fly = null
  }

  private onUp = (e: PointerEvent) => {
    const d = this.down
    this.down = null
    if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) return // it was a drag
    this.setPointer(e)
    const pin = this.raycaster.intersectObjects(this.pinMeshes, false)[0]
    if (pin) {
      const p = this.pinData.get(pin.object)!
      this.cb.onPinClick(p.storeId, p.branchId)
      return
    }
    const hit = this.raycaster.intersectObject(this.island, false)[0]
    if (hit) {
      const { lat, lng } = toLatLng(hit.point)
      this.cb.onPick(lat, lng)
    }
  }

  private onMove = (e: PointerEvent) => {
    if (this.down) return
    this.setPointer(e)
    const hit = this.raycaster.intersectObjects(this.pinMeshes, false)[0]?.object ?? null
    if (hit !== this.hovered) {
      this.hovered = hit
      this.renderer.domElement.style.cursor = hit ? 'pointer' : this.raycaster.intersectObject(this.island, false).length ? 'crosshair' : 'grab'
    }
    const r = this.renderer.domElement.getBoundingClientRect()
    this.cb.onPinHover(hit ? this.pinData.get(hit)! : null, e.clientX - r.left, e.clientY - r.top)
  }

  private onLeave = () => {
    this.hovered = null
    this.cb.onPinHover(null, 0, 0)
  }

  // ---------------------------------------------------------------- loop

  /** Keep the island centred in the part of the map not covered by a side panel (px from the left). */
  setInsetLeft(px: number) {
    this.insetLeft = px
    this.resize()
  }

  private insetLeft = 0

  private resize() {
    const w = this.container.clientWidth || 1
    const h = this.container.clientHeight || 1
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    if (this.insetLeft > 0 && this.insetLeft < w * 0.6) this.camera.setViewOffset(w, h, -this.insetLeft / 2, 0, w, h)
    else this.camera.clearViewOffset()
    this.camera.updateProjectionMatrix()
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop)
    if (document.hidden) return
    const now = performance.now()
    if (this.fly) {
      const t = Math.min(1, (now - this.fly.t0) / this.fly.ms)
      const k = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
      this.controls.target.lerpVectors(this.fly.from, this.fly.to, k)
      this.camera.position.lerpVectors(this.fly.camFrom, this.fly.camTo, k)
      if (t >= 1) this.fly = null
    }
    // Pulsing ring + bobbing pins.
    const r = (this.pulse.userData.r as number | undefined) ?? 1
    const ph = (now % 2200) / 2200
    this.pulse.scale.setScalar(r * (0.15 + ph * 0.85))
    ;(this.pulse.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - ph)
    this.pins.children.forEach((g, i) => {
      const base = g.userData.base as number
      const hover = this.hovered && this.hovered.parent === g ? 1.3 : 1
      const s = THREE.MathUtils.lerp(g.scale.x, base * hover, 0.18)
      g.scale.setScalar(s)
      g.position.y = LAND_TOP + Math.sin(now / 600 + i) * 0.04
    })
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
  }

  dispose() {
    cancelAnimationFrame(this.raf)
    this.resizeObserver.disconnect()
    const canvas = this.renderer.domElement
    canvas.removeEventListener('pointerdown', this.onDown)
    canvas.removeEventListener('pointerup', this.onUp)
    canvas.removeEventListener('pointermove', this.onMove)
    canvas.removeEventListener('pointerleave', this.onLeave)
    this.controls.dispose()
    for (const m of this.pinMeshes) (m.material as THREE.Material).dispose()
    this.setArea(null)
    for (const d of this.disposables) d.dispose()
    this.renderer.dispose()
    canvas.remove()
  }
}

