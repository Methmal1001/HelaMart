import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import type { AvatarKind, ExperiencePhase, QualityLevel } from '~/types'
import { getSection, sectionAt, STORE } from '~/data/storeLayout'
import { StaticBatch } from './batch'
import { CollisionWorld } from './colliders'
import { MaterialLibrary } from './materials'
import { skyTexture } from './textures'
import { buildExterior, buildInterior } from './builders/shell'
import { buildFixtures } from './builders/fixtures'
import { AutoDoors } from './builders/doors'
import { Avatar } from './builders/avatar'
import { createCart, disposeCartResources } from './builders/cart'
import { ProductInstancer, type ProductSlot } from './products/ProductInstancer'
import { InputController } from './controls/InputController'
import { QUALITY_PRESETS, type EngineCallbacks, type EngineOptions } from './types'

const V = (x: number, z: number) => new THREE.Vector3(x, 0, z)
const AVATAR_SPOTS: Record<AvatarKind, THREE.Vector3> = { male: V(-1.15, 4.7), female: V(1.15, 4.7) }
const CART_SPOT = V(2.6, 3.3)
const TO_CART: Record<AvatarKind, THREE.Vector3[]> = {
  male: [V(-1.15, 4.7), V(0.4, 5.15), V(2.6, 4.95), V(2.6, 4.2)],
  female: [V(1.15, 4.7), V(1.9, 5.2), V(2.6, 4.95), V(2.6, 4.2)],
}
const TO_LOBBY = [V(2.6, 4.2), V(2.35, 3.0), V(1.1, 1.9), V(0.1, 0.9), V(0, -0.6), V(0, -2.4), V(0, STORE.lobby.z - 0.6)]
const LEAVE: Record<AvatarKind, THREE.Vector3[]> = {
  male: [V(-1.15, 4.7), V(-3.4, 5.7), V(-10, 6.1), V(-19, 6.3)],
  female: [V(1.15, 4.7), V(3.4, 5.8), V(10, 6.1), V(19, 6.3)],
}
const CART_OFFSET = 0.92
const WALK_SPEED = 2.3
const RUN_SPEED = 4.2

type ViewMode = 'third' | 'first'

function curve(points: THREE.Vector3[]) {
  return new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.5)
}

function dampAngle(current: number, target: number, lambda: number, dt: number) {
  let delta = ((target - current + Math.PI) % (Math.PI * 2)) - Math.PI
  if (delta < -Math.PI) delta += Math.PI * 2
  return current + delta * (1 - Math.exp(-lambda * dt))
}

const nextTick = () => new Promise<void>((r) => setTimeout(r, 0))

/**
 * Orchestrates the HelaMart 3D experience: builds the store, runs the
 * entrance sequence and handles shopper movement, camera and picking.
 * Framework-agnostic — the Vue layer talks to it through public methods and
 * the callbacks passed in.
 */
export class StoreEngine {
  private renderer!: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(50, 1, 0.05, 260)
  private materials = new MaterialLibrary()
  private world = new CollisionWorld()
  private products = new ProductInstancer()
  private slots: ProductSlot[] = []
  private doors!: AutoDoors
  private avatars = {} as Record<AvatarKind, Avatar>
  private cart!: THREE.Group
  private input!: InputController
  private sun!: THREE.DirectionalLight
  private pmrem?: THREE.PMREMGenerator
  private resizeObserver?: ResizeObserver
  private raycaster = new THREE.Raycaster()
  private pin?: THREE.Group

  private phase: ExperiencePhase = 'loading'
  private quality: QualityLevel
  private selected: AvatarKind | null
  private viewMode: ViewMode = 'third'
  private disposed = false
  private lastTime = 0

  // Shopper state (inside the store).
  private pos = new THREE.Vector3()
  private vel = new THREE.Vector3()
  private yaw = 0
  private pitch = 0.18
  private lastSectionId: string | null | undefined = undefined
  private lastEmit = 0

  // Camera state.
  private camPos = new THREE.Vector3()
  private camLook = new THREE.Vector3()
  private welcomeOffset = { x: 0, y: 0 }
  private currentOffset = { x: 0, y: 0 }
  private parallax = new THREE.Vector2()
  private parallaxTarget = new THREE.Vector2()

  // Entrance sequence.
  private seq: {
    t: number
    stage: 'toCart' | 'grab' | 'toLobby'
    path: THREE.CatmullRomCurve3
    length: number
    u: number
    speed: number
    grabTime: number
    leave?: { avatar: Avatar; path: THREE.CatmullRomCurve3; length: number; u: number }
    fromPos: THREE.Vector3
    fromLook: THREE.Vector3
  } | null = null

  // Picking.
  private hoverPoint: { x: number; y: number } | null = null
  private lastHoverCheck = 0
  private hoveredId: string | null = null

  constructor(
    private container: HTMLElement,
    private callbacks: EngineCallbacks,
    private options: EngineOptions,
  ) {
    this.quality = options.quality
    this.selected = options.avatar
  }

  // ---------------------------------------------------------------- setup

  async init() {
    const preset = QUALITY_PRESETS[this.quality]
    this.progress(0.05, 'Preparing the store')
    this.renderer = new THREE.WebGLRenderer({ antialias: preset.antialias, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, preset.pixelRatio))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.0
    this.renderer.shadowMap.enabled = preset.shadows
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    const canvas = this.renderer.domElement
    canvas.style.display = 'block'
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    canvas.style.touchAction = 'none'
    canvas.setAttribute('aria-hidden', 'true')
    canvas.addEventListener('webglcontextlost', this.onContextLost)
    this.container.appendChild(canvas)

    await this.waitForFonts()
    this.progress(0.15, 'Lighting the aisles')
    this.setupEnvironment()
    await nextTick()

    this.progress(0.3, 'Building the storefront')
    const group = new THREE.Group()
    const batch = new StaticBatch()
    const glassBatch = new StaticBatch()
    const lightBatch = new StaticBatch()
    const shellCtx = { batch, glassBatch, lightBatch, materials: this.materials, world: this.world, group }
    buildExterior(shellCtx)
    buildInterior(shellCtx)
    await nextTick()

    this.progress(0.5, 'Stocking the shelves')
    buildFixtures({ batch, glassBatch, materials: this.materials, world: this.world, slots: this.slots, group })
    batch.build(group, { castShadow: true, receiveShadow: true })
    lightBatch.build(group, { castShadow: false, receiveShadow: false })
    glassBatch.build(group, { castShadow: false, receiveShadow: false }).forEach((m) => (m.renderOrder = 2))
    this.scene.add(group)
    await nextTick()

    this.progress(0.7, 'Arranging products')
    this.products.build(this.slots, preset.depthRows)
    this.scene.add(this.products.group)
    await nextTick()

    this.progress(0.85, 'Opening the doors')
    this.doors = new AutoDoors(this.materials)
    this.scene.add(this.doors.group)
    this.buildCharacters()
    this.buildPin()

    this.input = new InputController(canvas, {
      onClick: (x, y) => this.handleClick(x, y),
      onHoverMove: (x, y) => {
        this.hoverPoint = { x, y }
        const r = this.container.getBoundingClientRect()
        this.parallaxTarget.set((x / r.width) * 2 - 1, (y / r.height) * 2 - 1)
      },
      onHoverLeave: () => {
        this.hoverPoint = null
        this.parallaxTarget.set(0, 0)
      },
      onPointerLock: (locked) => this.callbacks.onPointerLock?.(locked),
      onToggleView: () => this.toggleView(),
      onToggleLock: () => (this.input.locked ? this.input.exitLock() : this.input.requestLock()),
    })
    canvas.tabIndex = -1

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(this.container)
    this.resize()

    if (this.options.startInside) this.placeInside(this.options.spawn ?? null)
    else this.setPhase('welcome')
    this.resetWelcomeCamera()

    // Compile shaders before the first visible frame to avoid a hitch.
    this.renderer.compile(this.scene, this.camera)
    this.progress(1, 'Welcome')
    this.lastTime = performance.now()
    this.renderer.setAnimationLoop(this.loop)
    // Dev-only handle for profiling (renderer.info) from the console.
    if (import.meta.dev) (window as unknown as { __helamart?: unknown }).__helamart = { renderer: this.renderer, engine: this }
    this.renderPortraits()
  }

  private progress(value: number, label: string) {
    this.callbacks.onProgress?.(value, label)
  }

  private async waitForFonts() {
    if (!('fonts' in document)) return
    await Promise.race([
      document.fonts.load(`800 64px "Plus Jakarta Sans"`).catch(() => undefined),
      new Promise((r) => setTimeout(r, 1500)),
    ])
  }

  private setupEnvironment() {
    const preset = QUALITY_PRESETS[this.quality]
    const sky = skyTexture()
    this.scene.background = sky
    this.scene.fog = new THREE.Fog('#E6EEEA', 55, 160)

    this.pmrem = new THREE.PMREMGenerator(this.renderer)
    const room = new RoomEnvironment()
    this.scene.environment = this.pmrem.fromScene(room, 0.04).texture
    this.scene.environmentIntensity = 0.55
    room.traverse((o) => {
      const mesh = o as THREE.Mesh
      mesh.geometry?.dispose()
      ;(mesh.material as THREE.Material | undefined)?.dispose?.()
    })

    this.scene.add(new THREE.HemisphereLight('#FFFFFF', '#BBA98A', 1.25))
    this.sun = new THREE.DirectionalLight('#FFF3DF', 2.1)
    this.sun.position.set(10, 24, 16)
    this.sun.target.position.set(0, 0, -12)
    this.sun.castShadow = preset.shadows
    const cam = this.sun.shadow.camera
    cam.left = -30
    cam.right = 30
    cam.top = 30
    cam.bottom = -30
    cam.near = 1
    cam.far = 80
    this.sun.shadow.mapSize.set(preset.shadowMapSize, preset.shadowMapSize)
    this.sun.shadow.bias = -0.0005
    this.sun.shadow.normalBias = 0.03
    this.scene.add(this.sun, this.sun.target)
  }

  private buildCharacters() {
    for (const kind of ['male', 'female'] as AvatarKind[]) {
      const a = new Avatar(kind)
      a.group.position.copy(AVATAR_SPOTS[kind])
      a.setSelected(kind === this.selected)
      this.avatars[kind] = a
      this.scene.add(a.group)
    }
    this.cart = createCart()
    this.cart.position.copy(CART_SPOT)
    this.scene.add(this.cart)
    // A couple of spare carts lined up at the entrance.
    for (const dx of [0.8, 1.6]) {
      const spare = createCart()
      spare.position.set(CART_SPOT.x + dx, 0, CART_SPOT.z)
      this.scene.add(spare)
    }
  }

  private buildPin() {
    const pin = new THREE.Group()
    const gold = new THREE.MeshStandardMaterial({ color: '#E1C987', emissive: '#E1C987', emissiveIntensity: 0.6, roughness: 0.3 })
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.22, 16), gold)
    cone.rotation.x = Math.PI
    cone.position.y = 0.11
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), new THREE.MeshStandardMaterial({ color: '#174D38', roughness: 0.4 }))
    ball.position.y = 0.3
    pin.add(cone, ball)
    pin.visible = false
    this.pin = pin
    this.scene.add(pin)
  }

  /** Render small transparent portraits of each avatar for the selection cards. */
  private renderPortraits() {
    try {
      const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
      r.setSize(300, 360, false)
      r.outputColorSpace = THREE.SRGBColorSpace
      r.toneMapping = THREE.ACESFilmicToneMapping
      const scene = new THREE.Scene()
      scene.add(new THREE.HemisphereLight('#ffffff', '#c9b994', 2.2))
      const key = new THREE.DirectionalLight('#ffffff', 2.4)
      key.position.set(1.5, 2.5, 3)
      scene.add(key)
      const cam = new THREE.PerspectiveCamera(26, 300 / 360, 0.1, 20)
      cam.position.set(0.35, 1.25, 4.1)
      cam.lookAt(0, 0.92, 0)
      const out = {} as Record<AvatarKind, string>
      for (const kind of ['male', 'female'] as AvatarKind[]) {
        const a = new Avatar(kind)
        a.group.rotation.y = 0.25
        a.update(0.016, 0)
        scene.add(a.group)
        r.render(scene, cam)
        out[kind] = r.domElement.toDataURL('image/png')
        scene.remove(a.group)
        disposeObject(a.group)
      }
      r.dispose()
      r.forceContextLoss()
      this.callbacks.onAvatarPortraits?.(out)
    } catch {
      // Portraits are decorative; the UI falls back to illustrated icons.
    }
  }

  // ---------------------------------------------------------------- public API

  selectAvatar(kind: AvatarKind) {
    const previous = this.selected
    this.selected = kind
    if (this.phase === 'inside') {
      // Swap characters in place, keeping the cart.
      if (previous && previous !== kind) this.avatars[previous].group.visible = false
      const me = this.avatars[kind]
      me.setSelected(false)
      me.pushing = true
      me.group.visible = this.viewMode === 'third'
      if (this.viewMode === 'third') this.attachCart(me)
      this.syncAvatar(me)
      return
    }
    for (const a of Object.values(this.avatars)) a.setSelected(a.kind === kind)
    if (this.phase === 'welcome') this.avatars[kind].wave()
  }

  /** Leave the store and return to the entrance / avatar selection. */
  returnToEntrance() {
    if (this.phase !== 'inside') return
    this.input.exitLock()
    if (this.viewMode === 'first') this.toggleView()
    this.scene.attach(this.cart)
    this.cart.position.copy(CART_SPOT)
    this.cart.rotation.set(0, 0, 0)
    for (const a of Object.values(this.avatars)) {
      a.group.visible = true
      a.group.position.copy(AVATAR_SPOTS[a.kind])
      a.group.rotation.set(0, 0, 0)
      a.pushing = false
      a.setSelected(a.kind === this.selected)
    }
    this.doors.snap(false)
    this.products.setHighlight(null)
    if (this.pin) this.pin.visible = false
    this.setPhase('welcome')
    this.resetWelcomeCamera()
  }

  /** Begin the entrance sequence for the selected avatar. */
  enter() {
    if (this.phase !== 'welcome' || !this.selected) return
    const me = this.avatars[this.selected]
    const other = this.avatars[this.selected === 'male' ? 'female' : 'male']
    me.setSelected(false)

    if (this.options.reducedMotion) {
      other.group.visible = false
      this.placeInside(null)
      this.callbacks.onWelcomeInside?.()
      return
    }

    const path = curve(TO_CART[this.selected])
    const leavePath = curve(LEAVE[other.kind])
    this.seq = {
      t: 0,
      stage: 'toCart',
      path,
      length: path.getLength(),
      u: 0,
      speed: 0,
      grabTime: 0,
      leave: { avatar: other, path: leavePath, length: leavePath.getLength(), u: 0 },
      fromPos: this.camera.position.clone(),
      fromLook: this.camLook.clone(),
    }
    this.setPhase('entering')
  }

  goToSection(id: string) {
    const s = getSection(id)
    if (!s || this.phase !== 'inside') return
    this.teleport(s.viewpoint.x, s.viewpoint.z, s.viewpoint.yaw)
  }

  /** Walk the shopper to a product and drop a locator pin above it. */
  goToProduct(productId: string) {
    const loc = this.products.locations.get(productId)
    if (!loc || this.phase !== 'inside') return false
    const n = loc.normal
    const standX = loc.position.x + n.x * 1.7
    const standZ = loc.position.z + n.z * 1.7
    this.teleport(standX, standZ, Math.atan2(n.x, n.z))
    this.pitch = 0.08
    if (this.pin) {
      this.pin.position.copy(loc.position).add(new THREE.Vector3(0, 0.12, 0))
      this.pin.userData.until = performance.now() + 9000
      this.pin.userData.baseY = this.pin.position.y
      this.pin.visible = true
    }
    return true
  }

  setMoveInput(x: number, y: number) {
    this.input?.setJoystick(x, y)
  }

  /** Pause movement (e.g. while a dialog has focus). */
  setInputEnabled(enabled: boolean) {
    if (!this.input) return
    this.input.enabled = enabled
    if (!enabled) {
      this.input.clear()
      this.input.exitLock()
    }
  }

  requestPointerLock() {
    this.input?.requestLock()
  }

  exitPointerLock() {
    this.input?.exitLock()
  }

  toggleView() {
    if (this.phase !== 'inside' || !this.selected) return
    this.viewMode = this.viewMode === 'third' ? 'first' : 'third'
    this.avatars[this.selected].group.visible = this.viewMode === 'third'
    // Keep the cart in view in first person.
    if (this.viewMode === 'first') {
      this.scene.attach(this.cart)
    } else {
      this.attachCart(this.avatars[this.selected])
    }
  }

  get view() {
    return this.viewMode
  }

  /** Shift the composition so the store isn't hidden behind the welcome panel. */
  setWelcomeOffset(x: number, y: number) {
    this.welcomeOffset = { x, y }
  }

  setQuality(q: QualityLevel) {
    if (q === this.quality) return
    this.quality = q
    const preset = QUALITY_PRESETS[q]
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, preset.pixelRatio))
    this.renderer.shadowMap.enabled = preset.shadows
    this.sun.castShadow = preset.shadows
    this.sun.shadow.mapSize.set(preset.shadowMapSize, preset.shadowMapSize)
    this.sun.shadow.map?.dispose()
    this.sun.shadow.map = null
    this.products.build(this.slots, preset.depthRows)
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material
      if (Array.isArray(m)) m.forEach((x) => (x.needsUpdate = true))
      else if (m) (m as THREE.Material).needsUpdate = true
    })
    this.resize()
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.renderer?.setAnimationLoop(null)
    this.resizeObserver?.disconnect()
    this.input?.dispose()
    this.products.dispose()
    this.scene.traverse((o) => {
      if (o.userData.shared) return
      disposeMeshResources(o)
    })
    disposeCartResources()
    this.materials.dispose()
    ;(this.scene.background as THREE.Texture | null)?.dispose?.()
    this.scene.environment?.dispose()
    this.pmrem?.dispose()
    if (this.renderer) {
      this.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLost)
      this.renderer.dispose()
      this.renderer.domElement.remove()
    }
  }

  // ---------------------------------------------------------------- internals

  private setPhase(phase: ExperiencePhase) {
    this.phase = phase
    if (this.input) this.input.movementEnabled = phase === 'inside'
    this.callbacks.onPhase?.(phase)
  }

  private onContextLost = (e: Event) => {
    e.preventDefault()
    this.renderer.setAnimationLoop(null)
    this.setPhase('error')
  }

  private resize() {
    const w = this.container.clientWidth || 1
    const h = this.container.clientHeight || 1
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.fov = w / h < 0.8 ? 58 : 50
    this.camera.updateProjectionMatrix()
    this.applyViewOffset()
  }

  private applyViewOffset() {
    const w = this.container.clientWidth || 1
    const h = this.container.clientHeight || 1
    const { x, y } = this.currentOffset
    if (Math.abs(x) < 1e-3 && Math.abs(y) < 1e-3) this.camera.clearViewOffset()
    else this.camera.setViewOffset(w, h, -x * w, y * h, w, h)
  }

  private welcomePose() {
    const aspect = this.camera.aspect
    const dist = Math.max(11.5, 4.7 + 6.4 / (0.93 * aspect))
    const pos = new THREE.Vector3(0, 1.85 + (aspect < 0.8 ? 0.6 : 0), dist)
    const look = new THREE.Vector3(0, 2.3, 0)
    return { pos, look }
  }

  private resetWelcomeCamera() {
    if (this.phase === 'inside') {
      this.snapFollowCamera()
      return
    }
    const { pos, look } = this.welcomePose()
    this.camera.position.copy(pos)
    this.camLook.copy(look)
    this.camera.lookAt(look)
  }

  private placeInside(spawn: { x: number; z: number; yaw: number } | null) {
    const kind = this.selected ?? 'male'
    this.selected = kind
    const me = this.avatars[kind]
    const other = this.avatars[kind === 'male' ? 'female' : 'male']
    other.group.visible = false
    me.setSelected(false)
    this.pos.set(spawn?.x ?? STORE.lobby.x, 0, spawn?.z ?? STORE.lobby.z)
    this.yaw = spawn?.yaw ?? STORE.lobby.yaw
    this.vel.set(0, 0, 0)
    me.pushing = true
    this.attachCart(me)
    this.syncAvatar(me)
    this.doors.snap(false)
    this.currentOffset = { x: 0, y: 0 }
    this.welcomeOffset = { x: 0, y: 0 }
    this.applyViewOffset()
    this.seq = null
    this.setPhase('inside')
    this.snapFollowCamera()
  }

  private attachCart(avatar: Avatar) {
    avatar.group.add(this.cart)
    this.cart.position.set(0, 0, CART_OFFSET)
    this.cart.rotation.set(0, Math.PI, 0)
  }

  private teleport(x: number, z: number, yaw: number) {
    const out = { x, z }
    for (let i = 0; i < 3; i++) this.resolveCollisions(out, yaw)
    this.pos.set(out.x, 0, out.z)
    this.yaw = yaw
    this.pitch = 0.18
    this.vel.set(0, 0, 0)
    if (this.selected) this.syncAvatar(this.avatars[this.selected])
    this.snapFollowCamera()
  }

  private loop = () => {
    const now = performance.now()
    const dt = Math.min(0.1, (now - this.lastTime) / 1000)
    this.lastTime = now
    if (this.disposed) return

    const people: THREE.Vector3[] = []
    if (this.phase === 'entering' && this.selected) people.push(this.avatars[this.selected].group.position)
    if (this.phase === 'inside') people.push(this.pos)
    this.doors.update(dt, people)

    // Ease the composition offset (welcome panel ↔ full screen).
    const tx = this.phase === 'welcome' ? this.welcomeOffset.x : 0
    const ty = this.phase === 'welcome' ? this.welcomeOffset.y : 0
    const k = 1 - Math.exp(-dt * 4)
    if (Math.abs(tx - this.currentOffset.x) > 1e-4 || Math.abs(ty - this.currentOffset.y) > 1e-4) {
      this.currentOffset.x += (tx - this.currentOffset.x) * k
      this.currentOffset.y += (ty - this.currentOffset.y) * k
      this.applyViewOffset()
    }

    if (this.phase === 'welcome') this.updateWelcome(dt)
    else if (this.phase === 'entering') this.updateEntering(dt)
    else if (this.phase === 'inside') this.updateInside(dt, now)

    if (this.pin?.visible) {
      const until = this.pin.userData.until as number
      if (now > until) this.pin.visible = false
      this.pin.position.y = (this.pin.userData.baseY as number) + Math.abs(Math.sin(now / 260)) * 0.08
      this.pin.rotation.y += dt * 2
    }

    this.renderer.render(this.scene, this.camera)
  }

  private updateWelcome(dt: number) {
    for (const a of Object.values(this.avatars)) a.update(dt, 0)
    const { pos, look } = this.welcomePose()
    const reduce = this.options.reducedMotion
    if (!reduce) this.parallax.lerp(this.parallaxTarget, 1 - Math.exp(-dt * 3))
    pos.x += this.parallax.x * 0.7
    pos.y -= this.parallax.y * 0.25
    this.camera.position.lerp(pos, 1 - Math.exp(-dt * 5))
    this.camLook.lerp(look, 1 - Math.exp(-dt * 5))
    this.camera.lookAt(this.camLook)
    this.hoverAvatars()
  }

  private updateEntering(dt: number) {
    const seq = this.seq
    if (!seq || !this.selected) return
    const me = this.avatars[this.selected]
    seq.t += dt

    // The other avatar strolls off along the pavement.
    if (seq.leave) {
      const l = seq.leave
      l.u = Math.min(1, l.u + (1.5 * dt) / l.length)
      const p = l.path.getPointAt(l.u)
      const tan = l.path.getTangentAt(l.u)
      l.avatar.group.position.copy(p)
      l.avatar.group.rotation.y = dampAngle(l.avatar.group.rotation.y, Math.atan2(tan.x, tan.z), 8, dt)
      l.avatar.update(dt, l.u < 1 ? 1.5 : 0)
      if (l.u >= 1) {
        l.avatar.group.visible = false
        seq.leave = undefined
      }
    }

    let speed = 0
    if (seq.stage === 'grab') {
      seq.grabTime += dt
      me.group.rotation.y = dampAngle(me.group.rotation.y, Math.PI, 10, dt)
      if (seq.grabTime > 0.45) {
        me.pushing = true
        me.group.rotation.y = Math.PI
        this.attachCart(me)
        seq.stage = 'toLobby'
        seq.path = curve(TO_LOBBY)
        seq.length = seq.path.getLength()
        seq.u = 0
        seq.speed = 0
      }
    } else {
      const cruise = seq.stage === 'toCart' ? 1.5 : 1.35
      // Wait for the sensor doors before walking through them.
      const p0 = me.group.position
      const blocked = seq.stage === 'toLobby' && p0.z < 1.7 && p0.z > -0.3 && this.doors.openAmount < 0.9
      const target = blocked ? 0 : cruise
      seq.speed += (target - seq.speed) * (1 - Math.exp(-dt * 4))
      speed = seq.speed
      seq.u = Math.min(1, seq.u + (speed * dt) / seq.length)
      const p = seq.path.getPointAt(seq.u)
      const tan = seq.path.getTangentAt(seq.u)
      me.group.position.copy(p)
      if (seq.u < 0.999) me.group.rotation.y = dampAngle(me.group.rotation.y, Math.atan2(tan.x, tan.z), 9, dt)
      if (seq.u >= 1) {
        if (seq.stage === 'toCart') {
          seq.stage = 'grab'
          seq.grabTime = 0
        } else {
          // Arrived in the lobby — hand control to the shopper.
          this.pos.copy(me.group.position)
          this.yaw = 0
          this.seq = null
          this.setPhase('inside')
          this.callbacks.onWelcomeInside?.()
          return
        }
      }
    }
    me.update(dt, speed)

    // Camera: blend from the welcome shot into a follow camera behind the avatar.
    const facing = me.group.rotation.y // avatar faces local +z
    const fwd = new THREE.Vector3(Math.sin(facing), 0, Math.cos(facing))
    const head = me.group.position.clone().add(new THREE.Vector3(0, 1.45, 0))
    const followPos = head.clone().addScaledVector(fwd, -3.6).add(new THREE.Vector3(0, 0.75, 0))
    const followLook = head.clone().addScaledVector(fwd, 2)
    const blend = THREE.MathUtils.smoothstep(seq.t, 0.2, 2.6)
    const desiredPos = seq.fromPos.clone().lerp(followPos, blend)
    const desiredLook = seq.fromLook.clone().lerp(followLook, blend)
    const k = 1 - Math.exp(-dt * (2 + blend * 4))
    this.camera.position.lerp(desiredPos, k)
    this.camLook.lerp(desiredLook, k)
    this.camera.lookAt(this.camLook)
  }

  private updateInside(dt: number, now: number) {
    if (!this.selected) return
    const me = this.avatars[this.selected]
    const { forward, strafe, turn, run } = this.input.axes()
    const look = this.input.consumeLook()

    this.yaw -= look.x * 0.0028 + turn * 1.9 * dt
    this.pitch = THREE.MathUtils.clamp(this.pitch + look.y * 0.0022, -0.45, 0.75)

    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw))
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw))
    const wish = new THREE.Vector3().addScaledVector(fwd, forward).addScaledVector(right, strafe)
    if (wish.lengthSq() > 1) wish.normalize()
    wish.multiplyScalar(run ? RUN_SPEED : WALK_SPEED)
    this.vel.lerp(wish, 1 - Math.exp(-dt * 9))
    if (this.vel.lengthSq() < 1e-5) this.vel.set(0, 0, 0)

    const next = { x: this.pos.x + this.vel.x * dt, z: this.pos.z + this.vel.z * dt }
    this.resolveCollisions(next, this.yaw)
    const moved = Math.hypot(next.x - this.pos.x, next.z - this.pos.z) / Math.max(dt, 1e-4)
    this.pos.x = next.x
    this.pos.z = next.z

    me.update(dt, moved)
    this.syncAvatar(me)
    this.updateFollowCamera(dt)

    if (now - this.lastHoverCheck > 90) {
      this.lastHoverCheck = now
      this.hoverProducts()
    }
    if (now - this.lastEmit > 120) {
      this.lastEmit = now
      const section = sectionAt(this.pos.x, this.pos.z)
      const sectionId = section?.id ?? null
      this.callbacks.onPlayer?.({ x: this.pos.x, z: this.pos.z, yaw: this.yaw, sectionId })
      this.lastSectionId = sectionId
    }
  }

  /** Shopper body + the cart in front both collide with fixtures. */
  private resolveCollisions(p: { x: number; z: number }, yaw: number) {
    const fx = -Math.sin(yaw)
    const fz = -Math.cos(yaw)
    for (let i = 0; i < 2; i++) {
      this.world.resolveCircle(p.x, p.z, 0.3, p)
      const cx = p.x + fx * CART_OFFSET
      const cz = p.z + fz * CART_OFFSET
      const c = this.world.resolveCircle(cx, cz, 0.36, { x: 0, z: 0 })
      p.x += c.x - cx
      p.z += c.z - cz
    }
  }

  private syncAvatar(me: Avatar) {
    me.group.position.copy(this.pos)
    me.group.rotation.y = this.yaw + Math.PI
    if (this.viewMode === 'first') {
      this.cart.position.set(this.pos.x - Math.sin(this.yaw) * CART_OFFSET, 0, this.pos.z - Math.cos(this.yaw) * CART_OFFSET)
      this.cart.rotation.set(0, this.yaw, 0)
    }
  }

  private followTargets() {
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw))
    if (this.viewMode === 'first') {
      const eye = this.pos.clone().add(new THREE.Vector3(0, 1.58, 0)).addScaledVector(fwd, 0.05)
      const look = eye.clone().addScaledVector(fwd, 2).add(new THREE.Vector3(0, -Math.tan(this.pitch) * 2 - 0.3, 0))
      return { pos: eye, look }
    }
    // Over-the-shoulder framing keeps the aisle ahead visible past the avatar.
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw))
    const head = this.pos.clone().add(new THREE.Vector3(0, 1.5, 0)).addScaledVector(right, 0.55)
    const dist = 3.3
    const desired = head
      .clone()
      .addScaledVector(fwd, -Math.cos(this.pitch) * dist)
      .add(new THREE.Vector3(0, Math.sin(this.pitch) * dist + 0.35, 0))
    // Pull the camera in front of shelves/walls behind the shopper.
    const clear = this.world.clearDistance(head, desired)
    const total = head.distanceTo(desired)
    const pos = clear < total ? head.clone().lerp(desired, Math.max(0.2, (clear - 0.25) / total)) : desired
    const look = head.clone().addScaledVector(fwd, 2.2).addScaledVector(right, -0.15).add(new THREE.Vector3(0, -0.3, 0))
    return { pos, look }
  }

  private updateFollowCamera(dt: number) {
    const { pos, look } = this.followTargets()
    const k = 1 - Math.exp(-dt * (this.viewMode === 'first' ? 30 : 10))
    this.camera.position.lerp(pos, k)
    this.camLook.lerp(look, k)
    this.camera.lookAt(this.camLook)
  }

  private snapFollowCamera() {
    const { pos, look } = this.followTargets()
    this.camera.position.copy(pos)
    this.camLook.copy(look)
    this.camera.lookAt(look)
  }

  private ndc(x: number, y: number) {
    const w = this.container.clientWidth || 1
    const h = this.container.clientHeight || 1
    return new THREE.Vector2((x / w) * 2 - 1, -(y / h) * 2 + 1)
  }

  private pickProduct(x: number, y: number) {
    this.raycaster.setFromCamera(this.ndc(x, y), this.camera)
    this.raycaster.far = 7
    const hits = this.raycaster.intersectObjects(this.products.pickables, false)
    const hit = hits.find((h) => h.instanceId !== undefined)
    if (!hit || hit.instanceId === undefined) return null
    const mesh = hit.object as THREE.InstancedMesh
    const id = this.products.productIdFor(mesh, hit.instanceId)
    return id ? { id, mesh, instanceId: hit.instanceId } : null
  }

  private pickAvatar(x: number, y: number): AvatarKind | null {
    this.raycaster.setFromCamera(this.ndc(x, y), this.camera)
    this.raycaster.far = 100
    const hits = this.raycaster.intersectObjects(
      Object.values(this.avatars).map((a) => a.group),
      true,
    )
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object
      while (o && !o.userData.avatarKind) o = o.parent
      if (o) return o.userData.avatarKind as AvatarKind
    }
    return null
  }

  private hoverAvatars() {
    if (!this.hoverPoint) return
    const kind = this.pickAvatar(this.hoverPoint.x, this.hoverPoint.y)
    this.renderer.domElement.style.cursor = kind ? 'pointer' : ''
  }

  private hoverProducts() {
    const locked = this.input.locked
    const r = this.container.getBoundingClientRect()
    const point = locked ? { x: r.width / 2, y: r.height / 2 } : this.hoverPoint
    const hit = point ? this.pickProduct(point.x, point.y) : null
    this.products.setHighlight(hit?.mesh ?? null, hit?.instanceId ?? -1)
    const id = hit?.id ?? null
    if (!locked) this.renderer.domElement.style.cursor = id ? 'pointer' : ''
    if (id !== this.hoveredId || id) {
      this.hoveredId = id
      this.callbacks.onProductHover?.(id && point ? { productId: id, x: point.x, y: point.y } : null)
    }
  }

  private handleClick(x: number, y: number) {
    if (this.phase === 'welcome') {
      const kind = this.pickAvatar(x, y)
      if (kind) this.callbacks.onAvatarPick?.(kind)
      return
    }
    if (this.phase !== 'inside') return
    const hit = this.pickProduct(x, y)
    if (hit) this.callbacks.onProductPick?.(hit.id)
  }
}

function disposeMeshResources(o: THREE.Object3D) {
  const mesh = o as THREE.Mesh
  if (mesh.geometry) mesh.geometry.dispose()
  const mats = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : []
  for (const m of mats) {
    for (const v of Object.values(m)) if (v instanceof THREE.Texture) v.dispose()
    m.dispose()
  }
}

function disposeObject(root: THREE.Object3D) {
  root.traverse(disposeMeshResources)
}
