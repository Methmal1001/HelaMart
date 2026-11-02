import type { Category, CategoryId, StoreAreaId } from '~/types'

/**
 * HelaMart's standard categories — every new supermarket starts with these,
 * and each owns one physical area of the 3D store. Supermarkets can rename,
 * recolour, reorder, hide or remove them and add their own.
 */
export const STANDARD_CATEGORIES: readonly Category[] = Object.freeze(([
  {
    id: 'produce',
    name: 'Fruits & Vegetables',
    shortName: 'Fresh Produce',
    description: 'Island-grown fruit, upcountry vegetables and fresh greens.',
    color: '#5E9E4A',
    icon: 'apple',
  },
  {
    id: 'bakery',
    name: 'Bakery',
    shortName: 'Bakery',
    description: 'Fresh bread, buns and cakes baked every morning.',
    color: '#B9803F',
    icon: 'bread',
  },
  {
    id: 'dairy',
    name: 'Dairy & Chilled',
    shortName: 'Dairy',
    description: 'Fresh milk, curd, yoghurt, cheese, butter and eggs.',
    color: '#3F86B8',
    icon: 'milk',
  },
  {
    id: 'meat-frozen',
    name: 'Meat & Frozen',
    shortName: 'Meat & Frozen',
    description: 'Chicken, seafood, frozen vegetables and ice cream.',
    color: '#B2504A',
    icon: 'snowflake',
  },
  {
    id: 'beverages',
    name: 'Beverages',
    shortName: 'Beverages',
    description: 'Ceylon tea, coffee, juices, soft drinks and water.',
    color: '#2C8A86',
    icon: 'bottle',
  },
  {
    id: 'snacks',
    name: 'Snacks & Confectionery',
    shortName: 'Snacks',
    description: 'Biscuits, chocolates, traditional sweets and savoury bites.',
    color: '#D27A2C',
    icon: 'cookie',
  },
  {
    id: 'staples',
    name: 'Rice, Flour & Staples',
    shortName: 'Staples',
    description: 'Rice, flour, dhal, spices, oil and pantry essentials.',
    color: '#A8862F',
    icon: 'wheat',
  },
  {
    id: 'cleaning',
    name: 'Cleaning',
    shortName: 'Cleaning',
    description: 'Detergents, dishwash, floor and bathroom care.',
    color: '#3A74B8',
    icon: 'spray',
  },
  {
    id: 'personal-care',
    name: 'Personal Care',
    shortName: 'Personal Care',
    description: 'Soap, shampoo, oral care and herbal wellness.',
    color: '#A65C88',
    icon: 'sparkle',
  },
  {
    id: 'household',
    name: 'Household Essentials',
    shortName: 'Household',
    description: 'Tissues, foil, storage, candles and everyday supplies.',
    color: '#5F7484',
    icon: 'home',
  },
] as Omit<Category, 'area' | 'standard'>[]).map((c) => ({ ...c, area: c.id as StoreAreaId, standard: true })))

export const STORE_AREAS: readonly StoreAreaId[] = STANDARD_CATEGORIES.map((c) => c.area)

/**
 * The live category list for the shop: the chosen supermarket's own
 * categories (names, colours, order; hidden/removed ones left out). Updated
 * in place by setActiveCategories so existing imports stay valid.
 */
export const categories: Category[] = STANDARD_CATEGORIES.map((c) => ({ ...c }))
let byId = new Map(categories.map((c) => [c.id, c]))
const standardById = new Map(STANDARD_CATEGORIES.map((c) => [c.id, c]))

export function setActiveCategories(list: Category[]) {
  categories.splice(0, categories.length, ...list)
  byId = new Map(categories.map((c) => [c.id, c]))
}

/** A category by id (falls back to the standard definition, then to a neutral placeholder). */
export function getCategory(id: CategoryId): Category {
  return byId.get(id) ?? standardById.get(id) ?? { id, name: 'Other', shortName: 'Other', description: '', color: '#5F7484', icon: 'tag', area: 'household' }
}

/** Categories shelved in one store area (standard one first). */
export function categoriesInArea(area: StoreAreaId): Category[] {
  return categories.filter((c) => c.area === area).sort((a, b) => Number(!!b.standard && b.id === area) - Number(!!a.standard && a.id === area))
}

/** Sign / minimap title for a store area, e.g. "Beverages" or "Baby Care · Personal Care". */
export function areaTitle(area: StoreAreaId): string {
  const list = categoriesInArea(area)
  return list.length ? list.map((c) => c.shortName || c.name).join(' · ') : 'Coming soon'
}

/** Colour for an area's signs: its first category's colour. */
export function areaColor(area: StoreAreaId): string {
  return categoriesInArea(area)[0]?.color ?? standardById.get(area)?.color ?? '#5F7484'
}
