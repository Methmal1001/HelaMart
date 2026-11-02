import type { FulfilmentMethod, OfferRule, PaymentMethod, ProductShape, ShopperLocation } from '~/types'

/**
 * Shapes of the HelaMart API (ASP.NET Core 8) as documented in its Swagger
 * (/swagger/v1/swagger.json). Property names are camelCase; fields the server
 * leaves null are omitted, so anything not always present is optional here.
 * Money is integer LKR cents; timestamps are ISO UTC strings; token expiries are epoch ms.
 */

/** Every error response: `{ status, message, code }`. */
export interface ApiErrorBody {
  status: number
  message: string
  code?: string
}

// ------------------------------------------------------------------ auth

export interface UserDto {
  id: string
  name: string
  email: string
  provider: 'password' | 'google'
  phone?: string
  avatarColor?: string
  pictureUrl?: string
  preferredLocation?: ShopperLocationDto
}

export type ShopperLocationDto = ShopperLocation

export interface AuthTokensDto {
  accessToken: string
  refreshToken: string
  accessExpiresAt: number
  refreshExpiresAt: number
  remember: boolean
}

export interface AuthResultDto {
  user: UserDto
  tokens: AuthTokensDto
}

export interface RegisterRequest {
  name: string
  email: string
  phone?: string
  password: string
  location?: ShopperLocationDto
  remember: boolean
}

export interface LoginRequest {
  email: string
  password: string
  remember: boolean
}

/** Real Google (`idToken`) or, in development, the simulated chooser (`email`, `name`). */
export type GoogleLoginRequest = ({ idToken: string } | { email: string; name?: string }) & { remember: boolean }

// ------------------------------------------------------------------ stores & catalogue

export interface BrandingProfileDto {
  logo?: string
  banner?: string
  primaryColor: string
  slogan: string
  accentColor?: string
  promoBanners?: string[]
  welcomeMessage?: string
  logoOnFixtures?: boolean
}

export interface PublicBranchDto {
  id: string
  name: string
  city: string
  district: string
  status: 'open' | 'temporarily_closed' | string
  hours: string
  lat: number
  lng: number
  deliveryRadiusKm: number
}

export interface PublicStoreDto {
  id: string
  name: string
  brandColor: string
  branding?: BrandingProfileDto
  branches: PublicBranchDto[]
}

export interface ProductDto {
  id: string
  name: string
  brand: string
  categoryId: string
  size: string
  unit: string
  priceCents: number
  shape: ProductShape
  color: string
  accent: string
  description: string
  badge?: 'Fresh' | 'Local' | 'New' | 'Popular'
  image?: string
  model?: string
  /** Units available at the requested branch. */
  stock: number
}

// ------------------------------------------------------------------ offers

export interface OfferDto {
  id: string
  code: string
  title: string
  description: string
  expiresAt: string
  /** `kind` decides which of the other fields are present. */
  rule: OfferRule
}

// ------------------------------------------------------------------ checkout

export interface PlaceOrderRequest {
  storeId: string
  branchId: string
  lines: { productId: string; quantity: number }[]
  delivery: { method: FulfilmentMethod; fullName: string; phone: string; address: string; city: string; slot: string; notes: string }
  payment: { method: PaymentMethod; card?: { name: string; number: string; expiry: string; cvc: string } }
}

// OrderDto and PriceBreakdownDto are the app's own `Order` and `PriceBreakdown` types (~/types).

// ------------------------------------------------------------------ partner applications

export interface ApplicationRequest {
  name: string
  legalName: string
  brNumber: string
  vatNumber?: string
  ownerName: string
  ownerNic: string
  email: string
  phone: string
  hqAddress: string
  district: string
  firstBranchName: string
  firstBranchCity: string
  expectedBranches: number
  documents: { kind: 'br_certificate' | 'owner_nic' | 'address_proof'; fileName: string; sizeKb: number }[]
  declaration: boolean
}

export interface ApplicationReceiptDto {
  reference: string
}

export interface ApplicationStatusDto {
  name: string
  reference: string
  status: string
  reason?: string
  submittedAt: string
}

/** Codes the server sends that end a signed-in session (sign in again). */
export const SESSION_ENDED_CODES = ['SESSION_INVALID', 'SESSION_EXPIRED', 'SESSION_REVOKED', 'ACCOUNT_SUSPENDED'] as const
