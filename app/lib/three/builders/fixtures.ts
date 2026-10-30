import * as THREE from 'three'
import type { CategoryId } from '~/types'
import { fixtures, GONDOLA, type FixturePlan } from '~/data/storeLayout'
import { getCategory } from '~/data/categories'
import { productsInArea } from '~/data/products'
import { StaticBatch, frameMatrix } from '../batch'
import type { CollisionWorld } from '../colliders'
import type { MaterialLibrary } from '../materials'
import type { ProductSlot } from '../products/ProductInstancer'
import { smallLabelTexture } from '../textures'

export interface FixtureContext {
  batch: StaticBatch
  glassBatch: StaticBatch
  materials: MaterialLibrary
  world: CollisionWorld
  slots: ProductSlot[]
  /** For unique (non-batched) meshes such as lane-number lights. */
  group: THREE.Group
}

const rotX = (a: number) => new THREE.Matrix4().makeRotationX(a)
const rotY = (a: number) => new THREE.Matrix4().makeRotationY(a)
const tr = (x: number, y: number, z: number) => new THREE.Matrix4().makeTranslation(x, y, z)
const mul = (...ms: THREE.Matrix4[]) => ms.reduce((acc, m) => acc.multiply(m), new THREE.Matrix4())

function tint(hex: string, amount: number) {
  return '#' + new THREE.Color(hex).lerp(new THREE.Color('#FFFFFF'), amount).getHexString()
}

export function buildFixtures(ctx: FixtureContext) {
  const produceCursor = { i: 0 }
  let laneNumber = 1
  for (const plan of fixtures) {
    const long = Math.max(plan.rect.w, plan.rect.d)
    const deep = Math.min(plan.rect.w, plan.rect.d)
    const theta = plan.rect.w >= plan.rect.d ? 0 : Math.PI / 2
    const frame = frameMatrix(plan.rect.x, plan.rect.z, theta)
    ctx.world.addRotatedRect(plan.rect.x, plan.rect.z, long, deep, theta, plan.kind === 'checkout' ? 1.1 : 2.4)

    switch (plan.kind) {
      case 'gondola':
        gondola(ctx, plan, frame, long, deep)
        break
      case 'produce':
        if (deep > 1.5) produceTable(ctx, frame, long, deep, produceCursor)
        else produceWall(ctx, frame, long, deep, produceCursor)
        break
      case 'chiller':
        uprightCabinet(ctx, plan, frame, long, deep, '#F4F8FA')
        break
      case 'freezer':
        if (deep > 1.2) uprightCabinet(ctx, plan, frame, long, deep, '#DCEFF8')
        else chestFreezer(ctx, plan, frame, long, deep)
        break
      case 'bakery':
        if (deep > 1.4) bakeryTable(ctx, plan, frame, long, deep)
        else bakeryWall(ctx, plan, frame, long, deep)
        break
      case 'checkout':
        checkout(ctx, frame, long, deep, laneNumber++)
        break
    }
  }
}

function gondola(ctx: FixtureContext, plan: FixturePlan, frame: THREE.Matrix4, L: number, D: number) {
  const m = ctx.materials
  const accent = getCategory(plan.categoryId!).color
  const H = GONDOLA.height
  const shelfMat = m.color('#EEF0EC', 0.45, 0.25)
  const frameMat = m.color('#D5DAD5', 0.4, 0.4)
  const backMat = m.color(tint(accent, 0.82), 0.85)
  const lipMat = m.color(accent, 0.5)
  const tagMat = m.color('#FFFFFF', 0.6)
  const b = ctx.batch

  b.box(m.brand('rackBase'), L, 0.12, D, 0, 0.06, 0, frame)
  b.box(backMat, L, H, 0.05, 0, H / 2, 0, frame)
  const modules = Math.round(L / GONDOLA.moduleLength)
  for (let i = 0; i <= modules; i++) {
    const x = -L / 2 + (i * L) / modules
    b.box(frameMat, 0.035, H, D * 0.96, x, H / 2, 0, frame)
  }
  // End caps in section colour.
  for (const s of [-1, 1]) b.box(lipMat, 0.05, H + 0.25, D + 0.04, (s * (L + 0.05)) / 2, (H + 0.25) / 2, 0, frame)
  b.box(lipMat, L + 0.1, 0.22, 0.08, 0, H + 0.14, 0, frame)
  // Supermarket theme band along the top of the rack.
  b.box(m.brand('primary'), L + 0.1, 0.07, 0.1, 0, H + 0.285, 0, frame)

  const levels = [0.13, 0.52, 0.91, 1.3, 1.69]
  for (const side of [1, -1]) {
    levels.forEach((y, i) => {
      const zc = side * (D / 4 + 0.012)
      b.box(shelfMat, L - 0.02, 0.025, D / 2 - 0.04, 0, y, zc, frame)
      b.box(lipMat, L - 0.02, 0.05, 0.014, 0, y + 0.005, side * (D / 2 - 0.02), frame)
      b.box(tagMat, L - 0.04, 0.022, 0.004, 0, y + 0.004, side * (D / 2 - 0.012), frame)
      const clearance = (levels[i + 1] ?? H + 0.05) - y - 0.06
      ctx.slots.push({
        sectionId: plan.sectionId,
        categoryId: plan.categoryId!,
        frame: mul(frame, tr(0, y + 0.0125, side * (D / 2 - 0.025)), rotY(side > 0 ? 0 : Math.PI)),
        length: L - 0.1,
        depth: D / 2 - 0.08,
        clearance,
        mode: 'shelf',
      })
    })
  }
}

function nextProduceId(cursor: { i: number }) {
  const list = productsInArea('produce')
  return list[cursor.i++ % list.length]!.id
}

function crateRow(
  ctx: FixtureContext,
  base: THREE.Matrix4,
  L: number,
  D: number,
  bins: number,
  cursor: { i: number },
) {
  const m = ctx.materials
  const crate = m.color('#B98552', 0.85)
  const crateDark = m.color('#8D623A', 0.85)
  const card = m.color('#FFFFFF', 0.6)
  const binW = L / bins
  for (let i = 0; i < bins; i++) {
    const cx = -L / 2 + binW * (i + 0.5)
    const w = binW - 0.05
    ctx.batch.box(crateDark, w, 0.03, D, cx, 0.015, -D / 2, base)
    ctx.batch.box(crate, w, 0.12, 0.025, cx, 0.06, 0, base)
    ctx.batch.box(crate, w, 0.12, 0.025, cx, 0.06, -D, base)
    ctx.batch.box(crate, 0.025, 0.12, D, cx - w / 2, 0.06, -D / 2, base)
    ctx.batch.box(crate, 0.025, 0.12, D, cx + w / 2, 0.06, -D / 2, base)
    // Price card.
    ctx.batch.box(card, 0.16, 0.1, 0.01, cx, 0.17, 0.01, base)
    ctx.slots.push({
      sectionId: 'produce',
      categoryId: 'produce',
      frame: mul(base.clone(), tr(cx, 0.03, -0.04)),
      length: w - 0.06,
      depth: D - 0.1,
      clearance: 0.4,
      mode: 'bin',
      productId: nextProduceId(cursor),
    })
  }
}

function produceTable(ctx: FixtureContext, frame: THREE.Matrix4, L: number, D: number, cursor: { i: number }) {
  const m = ctx.materials
  const wood = m.color('#7E5634', 0.8)
  ctx.batch.box(wood, L, 0.62, D - 0.2, 0, 0.31, 0, frame)
  ctx.batch.box(m.color('#5E9E4A', 0.7), L + 0.02, 0.08, D - 0.18, 0, 0.1, 0, frame)
  // Two tilted crate rows: one facing each side of the table.
  for (const side of [0, Math.PI]) {
    const base = mul(frame.clone(), rotY(side), tr(0, 0.66, D / 2), rotX(0.2))
    crateRow(ctx, base, L, D / 2 - 0.05, 3, cursor)
  }
}

function produceWall(ctx: FixtureContext, frame: THREE.Matrix4, L: number, D: number, cursor: { i: number }) {
  const m = ctx.materials
  const wood = m.color('#7E5634', 0.8)
  ctx.batch.box(wood, L, 0.7, D, 0, 0.35, 0, frame)
  ctx.batch.box(wood, L, 0.35, D * 0.5, 0, 0.88, -D / 4, frame)
  ctx.batch.box(m.color('#E9EFE2', 0.9), L, 2.3, 0.06, 0, 1.15, -D / 2 + 0.03, frame)
  // Timber canopy over the display.
  ctx.batch.box(m.color('#5E9E4A', 0.7), L, 0.08, 0.8, 0, 2.35, -D / 2 + 0.4, frame)
  ctx.batch.box(wood, L, 0.18, 0.05, 0, 2.28, -D / 2 + 0.8, frame)
  const bins = Math.round(L / 1.35)
  crateRow(ctx, mul(frame.clone(), tr(0, 0.72, D / 2), rotX(0.22)), L, D / 2 - 0.05, bins, cursor)
  crateRow(ctx, mul(frame.clone(), tr(0, 1.07, 0.02), rotX(0.22)), L, D / 2 - 0.12, bins, cursor)
}

function uprightCabinet(
  ctx: FixtureContext,
  plan: FixturePlan,
  frame: THREE.Matrix4,
  L: number,
  D: number,
  interior: string,
) {
  const m = ctx.materials
  const accent = getCategory(plan.categoryId!).color
  const body = m.color('#2B3237', 0.5, 0.3)
  const steel = m.color('#C9CFD2', 0.35, 0.6)
  const inner = m.emissive(interior, 0.35)
  const H = 2.15
  const b = ctx.batch

  b.box(body, L, 0.22, D, 0, 0.11, 0, frame)
  b.box(body, L, 0.3, D, 0, H + 0.15, 0, frame)
  b.box(inner, L - 0.1, H - 0.2, 0.05, 0, H / 2 + 0.1, -D / 2 + 0.06, frame)
  for (const s of [-1, 1]) b.box(body, 0.06, H, D, (s * (L - 0.06)) / 2, H / 2, 0, frame)
  // Illuminated header strip.
  b.box(m.emissive(accent, 0.6), L, 0.1, 0.03, 0, H + 0.05, D / 2 + 0.005, frame)

  const levels = [0.25, 0.68, 1.11, 1.54]
  levels.forEach((y, i) => {
    b.box(steel, L - 0.14, 0.02, D - 0.35, 0, y, -0.05, frame)
    ctx.slots.push({
      sectionId: plan.sectionId,
      categoryId: plan.categoryId!,
      frame: mul(frame.clone(), tr(0, y + 0.01, D / 2 - 0.2)),
      length: L - 0.2,
      depth: D - 0.45,
      clearance: (levels[i + 1] ?? H) - y - 0.05,
      mode: 'shelf',
    })
  })
  // Glass doors with frames and handles.
  const doorW = 1.08
  const doors = Math.floor(L / doorW)
  const startX = (-doors * doorW) / 2
  ctx.glassBatch.box(m.glass('cabinet-glass', 0.14, '#E5F2F6'), doors * doorW, H - 0.22, 0.02, 0, H / 2 + 0.11, D / 2 - 0.05, frame)
  for (let i = 0; i <= doors; i++) {
    const x = startX + i * doorW
    b.box(steel, 0.05, H - 0.2, 0.05, x, H / 2 + 0.1, D / 2 - 0.05, frame)
    if (i < doors) b.box(steel, 0.025, 0.7, 0.04, x + doorW - 0.09, 1.15, D / 2 - 0.01, frame)
  }
}

function chestFreezer(ctx: FixtureContext, plan: FixturePlan, frame: THREE.Matrix4, L: number, D: number) {
  const m = ctx.materials
  const accent = getCategory(plan.categoryId!).color
  const shell = m.color('#EEF2F3', 0.5, 0.1)
  const b = ctx.batch
  b.box(m.color('#2B3237', 0.6), L, 0.1, D, 0, 0.05, 0, frame)
  b.box(shell, L, 0.75, 0.06, 0, 0.45, D / 2 - 0.03, frame)
  b.box(shell, L, 0.75, 0.06, 0, 0.45, -D / 2 + 0.03, frame)
  b.box(shell, 0.06, 0.75, D, -L / 2 + 0.03, 0.45, 0, frame)
  b.box(shell, 0.06, 0.75, D, L / 2 - 0.03, 0.45, 0, frame)
  b.box(m.emissive('#DCEFF8', 0.25), L - 0.1, 0.03, D - 0.1, 0, 0.42, 0, frame)
  b.box(m.color(accent, 0.5), L + 0.01, 0.1, D + 0.01, 0, 0.62, 0, frame)
  ctx.glassBatch.box(m.glass('cabinet-glass', 0.14, '#E5F2F6'), L - 0.1, 0.02, D - 0.1, 0, 0.84, 0, frame)
  // Products laid flat, browsable from both long sides.
  for (const side of [0, Math.PI]) {
    ctx.slots.push({
      sectionId: plan.sectionId,
      categoryId: plan.categoryId!,
      frame: mul(frame.clone(), rotY(side), tr(0, 0.44, D / 2 - 0.08)),
      length: L - 0.2,
      depth: D / 2 - 0.1,
      clearance: 0.3,
      mode: 'flat',
      shapes: ['tray', 'box', 'bag', 'jar'],
    })
  }
}

function bakeryWall(ctx: FixtureContext, plan: FixturePlan, frame: THREE.Matrix4, L: number, D: number) {
  const m = ctx.materials
  const wood = m.color('#A0703F', 0.75)
  const dark = m.color('#6E4A2A', 0.8)
  const b = ctx.batch
  b.box(dark, L, 2.3, 0.05, 0, 1.15, -D / 2 + 0.025, frame)
  for (let i = 0; i <= 6; i++) b.box(dark, 0.06, 2.1, D, -L / 2 + (i * L) / 6, 1.05, 0, frame)
  b.box(dark, L, 0.25, D, 0, 0.125, 0, frame)
  // Striped awning in brand colours.
  const stripes = 18
  for (let i = 0; i < stripes; i++) {
    const mat = i % 2 ? m.brand('accent') : m.brand('primary')
    b.box(mat, L / stripes, 0.04, 0.7, -L / 2 + (L / stripes) * (i + 0.5), 2.45, D / 2 - 0.1, mul(frame.clone(), tr(0, 0, 0)), 0)
  }
  const levels = [0.25, 0.68, 1.11, 1.54]
  levels.forEach((y, i) => {
    b.box(wood, L - 0.02, 0.03, D - 0.06, 0, y, 0, frame)
    ctx.slots.push({
      sectionId: plan.sectionId,
      categoryId: plan.categoryId!,
      frame: mul(frame.clone(), tr(0, y + 0.015, D / 2 - 0.04)),
      length: L - 0.1,
      depth: D - 0.12,
      clearance: (levels[i + 1] ?? 2.0) - y - 0.05,
      mode: 'shelf',
    })
  })
}

function bakeryTable(ctx: FixtureContext, plan: FixturePlan, frame: THREE.Matrix4, L: number, D: number) {
  const m = ctx.materials
  const wood = m.color('#A0703F', 0.75)
  const b = ctx.batch
  b.box(m.color('#6E4A2A', 0.8), L, 0.78, D, 0, 0.39, 0, frame)
  b.box(wood, L + 0.06, 0.04, D + 0.06, 0, 0.8, 0, frame)
  b.box(wood, L - 0.4, 0.28, D * 0.35, 0, 0.96, 0, frame)
  for (const side of [0, Math.PI]) {
    ctx.slots.push({
      sectionId: plan.sectionId,
      categoryId: plan.categoryId!,
      frame: mul(frame.clone(), rotY(side), tr(0, 0.82, D / 2 - 0.03)),
      length: L - 0.1,
      depth: D / 2 - D * 0.18 - 0.05,
      clearance: 0.3,
      mode: 'shelf',
      shapes: ['loaf', 'round', 'long'],
    })
  }
  ctx.slots.push({
    sectionId: plan.sectionId,
    categoryId: plan.categoryId!,
    frame: mul(frame.clone(), tr(0, 1.1, D * 0.17)),
    length: L - 0.5,
    depth: D * 0.32,
    clearance: 0.3,
    mode: 'shelf',
    shapes: ['box', 'round'],
  })
}

function checkout(ctx: FixtureContext, frame: THREE.Matrix4, L: number, D: number, lane: number) {
  const m = ctx.materials
  const b = ctx.batch
  const green = m.brand('primary')
  const gold = m.brand('accent')
  const steel = m.color('#C4CACC', 0.3, 0.7)
  const belt = m.color('#26292B', 0.9)

  b.box(green, L, 0.82, D * 0.75, 0, 0.41, 0, frame)
  b.box(gold, L + 0.02, 0.04, D * 0.75 + 0.02, 0, 0.84, 0, frame)
  b.box(belt, L * 0.55, 0.03, D * 0.55, -L * 0.2, 0.87, 0, frame)
  b.box(steel, L * 0.3, 0.03, D * 0.6, L * 0.33, 0.87, 0, frame)
  // Scanner + register + card terminal on the cashier side.
  b.box(m.color('#1E2427', 0.4), 0.3, 0.12, 0.35, L * 0.08, 0.92, 0, frame)
  b.box(m.color('#1E2427', 0.4), 0.06, 0.45, 0.06, L * 0.12, 1.07, -D * 0.32, frame)
  b.box(m.emissive('#8FD3B6', 0.5), 0.34, 0.24, 0.03, L * 0.12, 1.32, -D * 0.32, frame)
  b.box(m.color('#1E2427', 0.4), 0.1, 0.03, 0.16, L * 0.02, 0.9, D * 0.3, frame)

  // Impulse rack with snacks at the queue end.
  const rackX = -L / 2 + 0.25
  b.box(steel, 0.45, 1.35, 0.03, rackX, 0.68, D * 0.42, frame)
  ;[0.35, 0.72, 1.08].forEach((y) => {
    b.box(m.color('#EEF0EC', 0.5, 0.2), 0.45, 0.02, 0.22, rackX, y, D * 0.42 + 0.12, frame)
    ctx.slots.push({
      sectionId: 'checkout',
      categoryId: 'snacks' as CategoryId,
      frame: mul(frame.clone(), tr(rackX, y + 0.01, D * 0.42 + 0.22)),
      length: 0.42,
      depth: 0.18,
      clearance: 0.3,
      mode: 'shelf',
      shapes: ['box', 'bag'],
    })
  })

  // Lane-number light pole.
  const poleX = L / 2 - 0.12
  b.box(steel, 0.05, 2.2, 0.05, poleX, 1.1, -D * 0.3, frame)
  const tex = smallLabelTexture(`Lane ${lane}`)
  const face = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })
  const side = m.brand('primary')
  const label = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.06), [side, side, side, side, face, face])
  label.applyMatrix4(mul(frame.clone(), tr(poleX, 2.3, -D * 0.3), rotY(Math.PI / 2)))
  ctx.group.add(label)
}
