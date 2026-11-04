import type { AuthResult, ShopperLocation, User } from '~/types'
import { api } from './http'
import type { AuthResultDto, GoogleLoginRequest, LoginRequest, PhoneRequest, RegisterRequest, UserDto } from './apiTypes'

/**
 * Auth API (HelaMart backend):
 *   POST /auth/register · POST /auth/login · POST /auth/google · POST /auth/refresh · POST /auth/logout · GET /auth/me
 *   PUT /me/location · PUT /me/phone
 * The server hashes passwords, signs short-lived JWT access tokens, rotates refresh tokens
 * (re-using a rotated one revokes the session family) and locks an email after repeated failures.
 */

/** PUT /me/phone — add or change the customer's mobile number. */
export function savePhone(accessToken: string, phone: string): Promise<User> {
  return api<UserDto>('/me/phone', { method: 'PUT', body: { phone } satisfies PhoneRequest, token: accessToken })
}

/** PUT /me/location — save (or change) the customer's shopping area. */
export function savePreferredLocation(accessToken: string, location: ShopperLocation): Promise<User> {
  return api<User>('/me/location', { method: 'PUT', body: location, token: accessToken })
}

/** POST /auth/login */
export function login(email: string, password: string, remember: boolean): Promise<AuthResult> {
  return api<AuthResultDto>('/auth/login', { method: 'POST', body: { email, password, remember } satisfies LoginRequest })
}

export interface RegisterInput {
  name: string
  email: string
  phone: string
  password: string
  /** Shopping area chosen at sign-up. */
  location?: ShopperLocation
}

/** POST /auth/register — creates a customer account and signs it in. */
export function register(input: RegisterInput, remember: boolean): Promise<AuthResult> {
  return api<AuthResultDto>('/auth/register', { method: 'POST', body: { ...input, remember } satisfies RegisterRequest })
}

/**
 * POST /auth/google — sends Google's ID token (credential); the server verifies it with Google.
 * The simulated account chooser (email + name, no token) is only accepted by a development server.
 */
export function loginWithGoogle(
  input: { idToken: string } | { email: string; name?: string },
  remember: boolean,
): Promise<AuthResult> {
  return api<AuthResultDto>('/auth/google', { method: 'POST', body: { ...input, remember } satisfies GoogleLoginRequest })
}

/** POST /auth/refresh — exchanges a refresh token for a new pair (rotation). */
export function refresh(refreshToken: string): Promise<AuthResult> {
  return api<AuthResult>('/auth/refresh', { method: 'POST', body: { refreshToken } })
}

/** POST /auth/logout — revokes the refresh token. */
export async function logout(refreshToken: string | null): Promise<void> {
  if (!refreshToken) return
  await api<void>('/auth/logout', { method: 'POST', body: { refreshToken } })
}

/** GET /auth/me */
export function me(accessToken: string): Promise<User> {
  return api<User>('/auth/me', { token: accessToken })
}
