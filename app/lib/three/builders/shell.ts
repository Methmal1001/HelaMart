import * as THREE from 'three'
import { sections, STORE, GONDOLA } from '~/data/storeLayout'
import type { StaticBatch } from '../batch'
import type { CollisionWorld } from '../colliders'
import type { MaterialLibrary } from '../materials'
import {
  floorTexture,
  pavementTexture,
  sectionSignTexture,
  storefrontSignTexture,
  welcomeMatTexture,
} from '../textures'

interface ShellContext {
  batch: StaticBatch
  glassBatch: StaticBatch
  lightBatch: StaticBatch
  materials: MaterialLibrary
  world: CollisionWorld
  group: THREE.Group
}

const WALL_H = 6.2
const T = 0.3 // wall thickness

function texturedPlane(map: THREE.Texture, w: number, h: number, opts: THREE.MeshStandardMaterialParameters = {}) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({ map, roughness: 0.6, ...opts }),
  )
  return mesh
}

/** Ground, pavement, facade, canopy and storefront sign. */
export function buildExterior(ctx: ShellContext) {
  const m = ctx.materials
  const b = ctx.batch

  // Asphalt car park + pavement.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(260, 260),
    m.color('#73776F', 0.95),
  )
  ground.rotation.x = -Math.PI / 2
  ground.position.set(0, -0.02, 60)
  ground.receiveShadow = true
  ctx.group.add(ground)

  const paveTex = pavementTexture()
  paveTex.repeat.set(52 / 1.2, 7.5 / 1.2)
  const pavement = new THREE.Mesh(
    new THREE.BoxGeometry(52, 0.12, 7.5),
    new THREE.MeshStandardMaterial({ map: paveTex, roughness: 0.9 }),
  )
  pavement.position.set(0, 0.0, 3.75)
  pavement.receiveShadow = true
  ctx.group.add(pavement)
  b.box(m.color('#BDB8AC', 0.9), 52, 0.16, 0.25, 0, 0.02, 7.6)
  // Parking bay lines.
  const line = m.color('#F2F0E8', 0.8)
  for (let x = -24; x <= 24; x += 2.8) {
    if (Math.abs(x) < 3.5) continue
    b.box(line, 0.1, 0.01, 4.6, x, 0.005, 11.2)
  }
  b.box(line, 52, 0.01, 0.1, 0, 0.005, 8.9)
  // Pedestrian crossing in front of the entrance.
  for (let i = 0; i < 7; i++) b.box(line, 0.45, 0.012, 4.2, -2.7 + i * 0.9, 0.006, 11.4)

  // Facade (front wall) built around windows and the entrance.
  const plaster = m.color('#F4EFE3', 0.85)
  const tile = m.color('#174D38', 0.55)
  const gold = m.color('#E1C987', 0.4, 0.35)
  const mullion = m.color('#3E4A45', 0.4, 0.6)
  const glass = m.glass('window-glass', 0.22, '#BFD9D2')
  const wallZ = 0

  const solid = (x0: number, x1: number, y0 = 0, y1 = WALL_H) =>
    b.box(plaster, x1 - x0, y1 - y0, T, (x0 + x1) / 2, (y0 + y1) / 2, wallZ)

  const W = STORE.maxX + T / 2
  const door = STORE.door
  const entranceHalf = door.width // fixed lites + sliding doors span 2× door width
  solid(-W, -17)
  solid(17, W)
  solid(-4.2, -entranceHalf)
  solid(entranceHalf, 4.2)
  solid(-entranceHalf, entranceHalf, door.height + 0.15, WALL_H)
  for (const [x0, x1] of [
    [-17, -4.2],
    [4.2, 17],
  ] as const) {
    solid(x0, x1, 0, 0.65)
    solid(x0, x1, 3.4, WALL_H)
    ctx.glassBatch.box(glass, x1 - x0, 2.75, 0.03, (x0 + x1) / 2, 2.025, wallZ)
    const panes = Math.round((x1 - x0) / 1.6)
    for (let i = 0; i <= panes; i++) {
      b.box(mullion, 0.07, 2.75, 0.12, x0 + ((x1 - x0) * i) / panes, 2.025, wallZ + 0.05)
    }
    b.box(mullion, x1 - x0, 0.07, 0.12, (x0 + x1) / 2, 0.68, wallZ + 0.05)
    b.box(mullion, x1 - x0, 0.07, 0.12, (x0 + x1) / 2, 3.37, wallZ + 0.05)
  }
  // Green tiled base band and gold cornice.
  b.box(tile, 2 * W + 0.1, 0.65, 0.08, 0, 0.325, wallZ + T / 2 + 0.04)
  b.box(gold, 2 * W + 0.1, 0.1, 0.12, 0, WALL_H - 0.35, wallZ + T / 2 + 0.06)
  b.box(tile, 2 * W + 0.2, 0.3, 0.5, 0, WALL_H + 0.05, wallZ)

  // Entrance canopy with downlights.
  b.box(tile, 9.4, 0.28, 2.7, 0, 3.32, 1.35)
  b.box(gold, 9.42, 0.1, 0.06, 0, 3.24, 2.71)
  for (const x of [-3, -1, 1, 3]) ctx.lightBatch.box(m.emissive('#FFF6DD', 1.4), 0.32, 0.02, 0.32, x, 3.17, 1.6)

  // Storefront sign.
  const sign = texturedPlane(storefrontSignTexture(), 12, 3, {
    emissive: '#ffffff',
    emissiveIntensity: 0.18,
    roughness: 0.45,
  })
  ;(sign.material as THREE.MeshStandardMaterial).emissiveMap = (sign.material as THREE.MeshStandardMaterial).map
  sign.position.set(0, 4.85, T / 2 + 0.07)
  ctx.group.add(sign)
  b.box(tile, 12.3, 3.3, 0.1, 0, 4.85, T / 2 + 0.01)

  // Welcome mat ("Ayubowan").
  const mat = texturedPlane(welcomeMatTexture(), 3.2, 0.8, { roughness: 0.95 })
  mat.rotation.x = -Math.PI / 2
  mat.position.set(0, 0.065, 1.1)
  mat.receiveShadow = true
  ctx.group.add(mat)

  // Planters with shrubs flanking the entrance.
  const planter = m.color('#E6DFD0', 0.85)
  const leaf = m.color('#3F7F45', 0.85)
  const leafDark = m.color('#2E6338', 0.85)
  const shrub = new THREE.IcosahedronGeometry(0.5, 1)
  for (const x of [-6.2, 6.2, -10.5, 10.5]) {
    b.box(planter, 1.6, 0.6, 0.9, x, 0.36, 1.2)
    b.box(m.color('#4A3527', 0.9), 1.5, 0.05, 0.8, x, 0.65, 1.2)
    for (let i = 0; i < 3; i++) {
      const mtx = new THREE.Matrix4().compose(
        new THREE.Vector3(x - 0.45 + i * 0.45, 0.85 + (i % 2) * 0.1, 1.2),
        new THREE.Quaternion(),
        new THREE.Vector3(0.75, 0.7, 0.7),
      )
      b.add(shrub, i % 2 ? leafDark : leaf, mtx)
    }
  }
  // Bollards.
  const bollard = new THREE.CylinderGeometry(0.09, 0.09, 0.9, 12)
  for (const x of [-4.8, 4.8, -8.4, 8.4]) {
    b.add(bollard, m.color('#3E4A45', 0.5, 0.4), new THREE.Matrix4().makeTranslation(x, 0.5, 6.6))
    b.box(gold, 0.2, 0.06, 0.2, x, 0.85, 6.6)
  }
}

/** Interior floor, walls, ceiling, light panels, floor markings and signage. */
export function buildInterior(ctx: ShellContext) {
  const m = ctx.materials
  const b = ctx.batch
  const { minX, maxX, minZ, height } = STORE
  const depth = Math.abs(minZ)
  const width = maxX - minX

  const tex = floorTexture()
  tex.repeat.set(width / 2, depth / 2)
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.32, metalness: 0.05 }),
  )
  floor.rotation.x = -Math.PI / 2
  floor.position.set(0, 0.002, minZ / 2)
  floor.receiveShadow = true
  ctx.group.add(floor)

  const plaster = m.color('#F4EFE3', 0.85)
  const dado = m.brand('primary')
  // Side and back walls (+ roof slab above the ceiling).
  b.box(plaster, T, WALL_H, depth, minX - T / 2, WALL_H / 2, minZ / 2)
  b.box(plaster, T, WALL_H, depth, maxX + T / 2, WALL_H / 2, minZ / 2)
  b.box(plaster, width + 2 * T, WALL_H, T, 0, WALL_H / 2, minZ - T / 2)
  b.box(dado, 0.02, 1.1, depth, minX + 0.01, 0.55, minZ / 2)
  b.box(dado, 0.02, 1.1, depth, maxX - 0.01, 0.55, minZ / 2)
  b.box(dado, width, 1.1, 0.02, 0, 0.55, minZ + 0.01)
  b.box(m.brand('accent'), width, 0.06, 0.03, 0, 1.13, minZ + 0.02)

  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    m.standard('ceiling', { color: '#F4F2EC', emissive: '#F4F2EC', emissiveIntensity: 0.32, roughness: 0.95 }),
  )
  ceiling.rotation.x = Math.PI / 2
  ceiling.position.set(0, height, minZ / 2)
  ctx.group.add(ceiling)
  const roof = new THREE.Mesh(new THREE.BoxGeometry(width + 2 * T, 0.2, depth + T), m.color('#D9D3C4', 0.9))
  roof.position.set(0, WALL_H - 0.1, minZ / 2 - T / 2)
  ctx.group.add(roof)

  // Light panels in a grid.
  const panel = m.emissive('#FFFDF5', 1.25)
  for (let x = -16; x <= 16; x += 4) {
    for (let z = -2.5; z >= minZ + 2; z -= 3.4) ctx.lightBatch.box(panel, 1.4, 0.04, 0.5, x, height - 0.03, z)
  }

  // Floor wayfinding: gold lines along the main routes.
  const lineMat = m.color('#D8BC6E', 0.5)
  b.box(lineMat, 0.12, 0.004, 26, 0, 0.006, -14.5)
  b.box(lineMat, 36, 0.004, 0.12, 0, 0.006, -13.6)
  b.box(lineMat, 36, 0.004, 0.12, 0, 0.006, -28.2)
  // Entrance zone inlay.
  b.box(m.color('#174D38', 0.5), 4.4, 0.004, 2.2, 0, 0.006, -1.6)
  b.box(m.color('#E1C987', 0.5), 4.6, 0.003, 2.4, 0, 0.005, -1.6)

  // Collision: perimeter walls (the front wall is solid once inside).
  const w = ctx.world
  w.addRect(minX - 0.5, minZ / 2, 1, depth + 2, 6)
  w.addRect(maxX + 0.5, minZ / 2, 1, depth + 2, 6)
  w.addRect(0, minZ - 0.5, width + 2, 1, 6)
  w.addRect(0, 0.4, width + 2, 0.8, 6)

  buildSignage(ctx)
}

function hangingSign(ctx: ShellContext, title: string, subtitle: string | undefined, color: string, x: number, y: number, z: number, w: number, doubleSided = true) {
  const tex = sectionSignTexture(title, subtitle, color)
  const h = w / 4
  // Aisle signs are backlit panels: crisp, true-colour text from anywhere in the store.
  const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })
  const front = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat)
  front.position.set(x, y, z + 0.02)
  ctx.group.add(front)
  if (doubleSided) {
    const back = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat)
    back.position.set(x, y, z - 0.02)
    back.rotation.y = Math.PI
    ctx.group.add(back)
  }
  const frame = ctx.materials.color('#174D38', 0.5)
  ctx.batch.box(frame, w + 0.06, h + 0.06, 0.03, x, y, z)
  if (doubleSided) {
    const cable = ctx.materials.color('#8A918D', 0.4, 0.6)
    const len = STORE.height - (y + h / 2)
    for (const s of [-1, 1]) ctx.batch.box(cable, 0.012, len, 0.012, x + s * (w / 2 - 0.15), y + h / 2 + len / 2, z)
  }
}

function buildSignage(ctx: ShellContext) {
  for (const s of sections) {
    if (s.kind === 'gondola') {
      hangingSign(ctx, s.name, s.aisle?.replace('Aisle ', 'A'), s.color, s.area.x, 3.15, GONDOLA.zStart + 0.3, 2.8)
      hangingSign(ctx, s.name, s.aisle?.replace('Aisle ', 'A'), s.color, s.area.x, 3.15, GONDOLA.zEnd - 0.3, 2.8)
    } else if (s.kind === 'produce') {
      hangingSign(ctx, s.name, undefined, s.color, s.area.x, 3.4, -3.6, 4.4)
    } else if (s.kind === 'checkout') {
      hangingSign(ctx, 'Checkout', undefined, s.color, s.area.x, 3.4, -8.4, 3.6)
    } else {
      // Back-wall sections get large wall signs.
      hangingSign(ctx, s.name, undefined, s.color, s.area.x, 3.25, STORE.minZ + 0.06, 4.8, false)
    }
  }
}
