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
  /**
   * Product photo: `media:<id>` (uploaded by the supermarket), an http(s) URL, or
   * absent — then generated packaging artwork is shown instead.
   */
  image?: string
  model?: string
  /** Units available at the shopper's selected branch (undefined = not tracked). */
  stock?: number
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
  | 'eye-off'
  | 'logout'
  | 'tag'
  | 'gift'
  | 'lock'
  | 'truck'
  | 'store'
  | 'card'
  | 'cash'
  | 'receipt'
  | 'printer'
  | 'shield'
  | 'users'
  | 'grid'
  | 'clipboard'
  | 'history'
  | 'package'
  | 'edit'
  | 'refresh'
  | 'key'
  | 'copy'
  | 'menu'

// ------------------------------------------------------------------ auth

export type AuthProvider = 'password' | 'google'

export interface User {
  id: string
  name: string
  email: string
  provider: AuthProvider
  phone?: string
  /** Hex colour used for the initials avatar when there is no picture. */
  avatarColor?: string
  pictureUrl?: string
  /** Shopping area saved on the account (used to list nearby supermarkets). */
  preferredLocation?: ShopperLocation
}

/** Where a shopper wants to shop near. */
export interface ShopperLocation {
  /** Town name, e.g. "Negombo". */
  label: string
  district: string
  lat: number
  lng: number
  /** How far the shopper is willing to look for supermarkets. */
  radiusKm: number
  source: 'town' | 'gps' | 'map'
}

/** Tokens issued by the auth API (mock now, real backend later). */
export interface AuthTokens {
  /** Short-lived JWT sent with API calls. */
  accessToken: string
  /** Long-lived opaque token used only to obtain a new access token (rotated on every use). */
  refreshToken: string
  accessExpiresAt: number
  refreshExpiresAt: number
  /** "Keep me signed in" — persistent cookie instead of a browser-session cookie. */
  remember: boolean
}

export interface AuthResult {
  user: User
  tokens: AuthTokens
}

// ------------------------------------------------------------------ offers & pricing

export type OfferRule =
  /** % off every product in a category. */
  | { kind: 'percent-category'; categoryId: CategoryId; percent: number; maxDiscountCents?: number }
  /** % off one specific product. */
  | { kind: 'percent-product'; productId: string; percent: number }
  /** Buy N, get M free (per product line). */
  | { kind: 'bxgy'; categoryId?: CategoryId; productIds?: string[]; buy: number; get: number }
  /** Fixed amount off the order above a minimum spend. */
  | { kind: 'fixed-off'; amountCents: number; minSpendCents: number }
  /** Delivery fee waived above a minimum spend. */
  | { kind: 'free-delivery'; minSpendCents: number }
  /** % off the whole basket above a minimum spend (optionally capped). */
  | { kind: 'percent-order'; percent: number; minSpendCents: number; maxDiscountCents?: number }

/**
 * Extra conditions a supermarket can put on an offer ("over Rs. 5,000",
 * "weekends only", "6–9 pm", "pickup orders"…). All set conditions must hold.
 */
export interface OfferConditions {
  /** Basket value (before discounts) must reach this. */
  minSpendCents?: number
  /** At least this many items in the basket. */
  minItems?: number
  /** Days of the week it runs (0 = Sunday … 6 = Saturday). Empty/absent = every day. */
  days?: number[]
  /** Daily time window, 24h clock, e.g. 18 → 21 for a 6–9 pm happy hour. */
  fromHour?: number
  toHour?: number
  /** Not before this date-time (scheduled offers). */
  startsAt?: string
  /** Only for home delivery or only for store pickup. */
  fulfilment?: FulfilmentMethod
  /** How many orders each customer can use it on. */
  perCustomerLimit?: number
}

export interface Offer {
  id: string
  code: string
  title: string
  description: string
  rule: OfferRule
  /** ISO date-time. */
  expiresAt: string
  conditions?: OfferConditions
  /** Supermarket running the offer (absent = a personal HelaMart offer). */
  storeId?: string
  storeName?: string
  /** Only for shoppers who haven't ordered from this supermarket yet. */
  forNewCustomers?: boolean
}

export interface PricedLine {
  productId: string
  quantity: number
  unitPriceCents: number
  lineTotalCents: number
  discountCents: number
  finalCents: number
  /** Offer applied to this line, if any. */
  offerId?: string
}

export interface AppliedOffer {
  offer: Offer
  discountCents: number
  scope: 'items' | 'order' | 'delivery'
}

export interface UnmetOffer {
  offer: Offer
  hint: string
}

export interface PriceBreakdown {
  lines: PricedLine[]
  itemCount: number
  subtotalCents: number
  itemDiscountCents: number
  orderDiscountCents: number
  deliveryFeeCents: number
  deliveryDiscountCents: number
  totalDiscountCents: number
  /** Value of the collected items after item + order discounts (excludes delivery). */
  itemsTotalCents: number
  totalCents: number
  applied: AppliedOffer[]
  unmet: UnmetOffer[]
}

// ------------------------------------------------------------------ checkout & orders

export type FulfilmentMethod = 'delivery' | 'pickup'
export type PaymentMethod = 'cod' | 'card'

export interface DeliveryDetails {
  method: FulfilmentMethod
  fullName: string
  phone: string
  address: string
  city: string
  slot: string
  notes: string
}

export interface CardDetails {
  name: string
  number: string
  expiry: string
  cvc: string
}

export interface OrderLine extends PricedLine {
  name: string
  size: string
}

export interface Order {
  id: string
  number: string
  /** Supermarket chain + branch the order was placed with. */
  storeId?: string
  branchId?: string
  createdAt: string
  userId: string
  customerName: string
  customerEmail: string
  lines: OrderLine[]
  breakdown: PriceBreakdown
  delivery: DeliveryDetails
  payment: { method: PaymentMethod; cardLast4?: string; status: 'paid' | 'pay-on-delivery' }
  status: 'confirmed'
}
