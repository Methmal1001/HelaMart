/**
 * Shared domain types for the HelaMart frontend.
 * These mirror the shapes a future catalogue / cart API is expected to return,
 * so mock data can be swapped for real endpoints without touching the UI.
 */

export type AvatarKind = 'male' | 'female'

export type CategoryId =
  | 'produce'
  | 'bakery'
  | 'dairy'
  | 'meat-frozen'
  | 'beverages'
  | 'snacks'
  | 'staples'
  | 'cleaning'
  | 'personal-care'
  | 'household'

/** Procedural 3D placeholder used until a real product model/image exists. */
export type ProductShape =
  | 'box'
  | 'tallBox'
  | 'bottle'
  | 'can'
  | 'jar'
  | 'bag'
  | 'carton'
  | 'tray'
  | 'loaf'
  | 'round'
  | 'long'
  | 'roll'

export interface Category {
  id: CategoryId
  name: string
  shortName: string
  description: string
  /** Accent colour used on signage, minimap and UI chips for this section. */
  color: string
  icon: IconName
}

export interface Product {
  id: string
  name: string
  /** Fictional sample brand. */
  brand: string
  categoryId: CategoryId
  /** Package size, e.g. "1 kg", "500 ml". */
  size: string
  /** Selling unit, e.g. "pack", "bottle", "per kg". */
  unit: string
  /** Price in LKR cents — integers avoid floating-point rounding in totals. */
  priceCents: number
  shape: ProductShape
  /** Main package colour (hex). */
  color: string
  /** Label / secondary colour (hex). */
  accent: string
  description: string
  badge?: 'Fresh' | 'Local' | 'New' | 'Popular'
  /** Optional real image or model paths — used automatically once provided. */
  image?: string
  model?: string
}

export interface CartLine {
  productId: string
  quantity: number
}

export interface CartLineView extends CartLine {
  product: Product
  lineTotalCents: number
}

export type FixtureKind = 'gondola' | 'produce' | 'chiller' | 'freezer' | 'bakery' | 'checkout'

/** A rectangle on the floor plan, in metres. x/z are the centre. */
export interface FloorRect {
  x: number
  z: number
  w: number
  d: number
}

export interface StoreSection {
  id: string
  name: string
  categoryId?: CategoryId
  /** Aisle label shown on hanging signs and the minimap. */
  aisle?: string
  kind: FixtureKind
  /** Area of the section on the floor plan (used by minimap + "you are here"). */
  area: FloorRect
  /** Where the shopper is placed when navigating to this section. yaw in radians. */
  viewpoint: { x: number; z: number; yaw: number }
  color: string
}

export type ExperiencePhase = 'loading' | 'welcome' | 'entering' | 'inside' | 'error' | 'unsupported'

export type QualityLevel = 'low' | 'balanced' | 'high'

export interface PlayerSnapshot {
  x: number
  z: number
  yaw: number
  sectionId: string | null
}

export type IconName =
  | 'apple'
  | 'bread'
  | 'milk'
  | 'snowflake'
  | 'bottle'
  | 'cookie'
  | 'wheat'
  | 'spray'
  | 'sparkle'
  | 'home'
  | 'cart'
  | 'basket'
  | 'close'
  | 'plus'
  | 'minus'
  | 'trash'
  | 'search'
  | 'map'
  | 'list'
  | 'mouse'
  | 'settings'
  | 'check'
  | 'arrow-right'
  | 'arrow-left'
  | 'door'
  | 'info'
  | 'pin'
  | 'keyboard'
  | 'alert'
  | 'user'
  | 'eye'
