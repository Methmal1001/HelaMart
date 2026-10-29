import type { CategoryId, FixtureKind, FloorRect, StoreSection } from '~/types'
import { getCategory } from './categories'

/**
 * Floor plan of the virtual store, in metres.
 *
 *   +x â†’ right, -z â†’ deeper into the store. The front wall (with the entrance)
 *   sits on z = 0; outside the store is z > 0.
 *
 * Both the 3D builders and the 2D minimap read from this single source,
 * so moving a section here moves it everywhere.
 */
export const STORE = {
  minX: -20,
  maxX: 20,
  minZ: -36,
  maxZ: 0,
  height: 5.2,
  door: { x: 0, width: 3.6, height: 2.9 },
  /** Where the shopper spawns when returning directly to the store. */
  lobby: { x: 0, z: -3.2, yaw: 0 },
} as const

export const GONDOLA = {
  zStart: -15,
  zEnd: -27,
  depth: 1.1,
  height: 2.05,
  levels: 5,
  moduleLength: 1.2,
}

export const GONDOLA_X = [-11.25, -6.75, -2.25, 2.25, 6.75, 11.25]
const GONDOLA_CATEGORIES: CategoryId[] = ['staples', 'snacks', 'beverages', 'cleaning', 'personal-care', 'household']

export interface FixturePlan {
  sectionId: string
  kind: FixtureKind
  categoryId?: CategoryId
  rect: FloorRect
  /** Direction the fixture's display face looks toward (radians, same convention as yaw). */
  facing: number
}

function section(
  id: string,
  kind: FixtureKind,
  categoryId: CategoryId | undefined,
  area: FloorRect,
  viewpoint: StoreSection['viewpoint'],
  aisle?: string,
): StoreSection {
  const category = categoryId ? getCategory(categoryId) : undefined
  return {
    id,
    kind,
    categoryId,
    name: category?.name ?? 'Checkout',
    aisle,
    area,
    viewpoint,
    color: category?.color ?? '#174D38',
  }
}

const halfAisle = 2.25
const gondolaMidZ = (GONDOLA.zStart + GONDOLA.zEnd) / 2
const gondolaLen = Math.abs(GONDOLA.zEnd - GONDOLA.zStart)

export const sections: StoreSection[] = [
  section('produce', 'produce', 'produce', { x: -11.5, z: -7.5, w: 15, d: 9 }, { x: -11.5, z: -2.8, yaw: 0 }),
  // Arriving here with items opens the checkout automatically; the viewpoint is the mouth of lane 2.
  section('checkout', 'checkout', undefined, { x: 11.5, z: -5, w: 13, d: 7 }, { x: 8.75, z: -7.9, yaw: Math.PI }),
  ...GONDOLA_X.map((x, i) =>
    section(
      `aisle-${i + 1}`,
      'gondola',
      GONDOLA_CATEGORIES[i],
      { x, z: gondolaMidZ, w: halfAisle * 2, d: gondolaLen + 2.4 },
      // Stand in the aisle just to the right of the gondola, looking down it.
      { x: x + 1.5, z: -14.3, yaw: 0 },
      `Aisle ${i + 1}`,
    ),
  ),
  section('dairy', 'chiller', 'dairy', { x: -12.5, z: -32, w: 15, d: 8 }, { x: -12.5, z: -29, yaw: 0 }),
  section('bakery', 'bakery', 'bakery', { x: 0, z: -32, w: 10, d: 8 }, { x: 0, z: -28.6, yaw: 0 }),
  section('meat-frozen', 'freezer', 'meat-frozen', { x: 12.5, z: -32, w: 15, d: 8 }, { x: 12.5, z: -28.4, yaw: 0 }),
]

/** Physical fixtures (shelves, tables, freezers, counters) to build. */
export const fixtures: FixturePlan[] = [
  // Produce: two rows of angled display tables.
  ...[-15.5, -11.5, -7.5].flatMap((x) => [
    { sectionId: 'produce', kind: 'produce' as const, categoryId: 'produce' as const, rect: { x, z: -6.2, w: 3, d: 1.7 }, facing: 0 },
    { sectionId: 'produce', kind: 'produce' as const, categoryId: 'produce' as const, rect: { x, z: -10.2, w: 3, d: 1.7 }, facing: 0 },
  ]),
  // Long produce wall display on the left wall.
  { sectionId: 'produce', kind: 'produce', categoryId: 'produce', rect: { x: -19.3, z: -7.5, w: 1.3, d: 8 }, facing: -Math.PI / 2 },

  // Checkout counters.
  ...[7, 10.5, 14, 17.5].map((x) => ({
    sectionId: 'checkout',
    kind: 'checkout' as const,
    rect: { x, z: -4.6, w: 1, d: 3.4 },
    facing: Math.PI,
  })),

  // Gondola shelving (double-sided).
  ...GONDOLA_X.map((x, i) => ({
    sectionId: `aisle-${i + 1}`,
    kind: 'gondola' as const,
    categoryId: GONDOLA_CATEGORIES[i],
    rect: { x, z: gondolaMidZ, w: GONDOLA.depth, d: gondolaLen },
    facing: 0,
  })),

  // Back wall: chillers, bakery, freezers.
  { sectionId: 'dairy', kind: 'chiller', categoryId: 'dairy', rect: { x: -12.5, z: -35.2, w: 13, d: 1.3 }, facing: 0 },
  { sectionId: 'bakery', kind: 'bakery', categoryId: 'bakery', rect: { x: 0, z: -35.3, w: 9, d: 1.1 }, facing: 0 },
  { sectionId: 'bakery', kind: 'bakery', categoryId: 'bakery', rect: { x: 0, z: -31.6, w: 4, d: 1.6 }, facing: 0 },
  { sectionId: 'meat-frozen', kind: 'freezer', categoryId: 'meat-frozen', rect: { x: 12.5, z: -35.2, w: 13, d: 1.3 }, facing: 0 },
  { sectionId: 'meat-frozen', kind: 'freezer', categoryId: 'meat-frozen', rect: { x: 9.5, z: -31.4, w: 4, d: 1.1 }, facing: 0 },
  { sectionId: 'meat-frozen', kind: 'freezer', categoryId: 'meat-frozen', rect: { x: 15.5, z: -31.4, w: 4, d: 1.1 }, facing: 0 },
]

export function sectionAt(x: number, z: number): StoreSection | null {
  for (const s of sections) {
    const { area } = s
    if (Math.abs(x - area.x) <= area.w / 2 && Math.abs(z - area.z) <= area.d / 2) return s
  }
  return null
}

export function getSection(id: string): StoreSection | undefined {
  return sections.find((s) => s.id === id)
}

export function sectionForCategory(categoryId: CategoryId): StoreSection | undefined {
  return sections.find((s) => s.categoryId === categoryId)
}
