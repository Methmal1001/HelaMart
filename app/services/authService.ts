<<<<<<< HEAD
import type { AuthResult, AuthTokens, ShopperLocation, User } from '~/types'
import { mockAccounts } from '~/data/mockUsers'
import { decodeJwt } from '~/utils/jwt'
import { ApiError } from './apiError'
import { readAdminDb } from './admin/db'
import { EMAIL_RE, isStrongPassword, normalizeSriLankanMobile } from '~/utils/validation'
import { DISTRICTS } from '~/data/sriLanka'
import { inSriLanka } from '~/data/places'
import { TOKEN_POLICY, hash, hashPassword, latency, randomId, readDb, signAccessToken, verifyAccessToken, writeDb } from './mock/server'
=======
import type { AuthResult, ShopperLocation, User } from '~/types'
import { api } from './http'
>>>>>>> 8e46a242e2aecf7d41f2156e1dff89087a4c12c2

/**
 * Auth API (HelaMart backend):
 *   POST /auth/register · POST /auth/login · POST /auth/google · POST /auth/refresh · POST /auth/logout · GET /auth/me
 *   PUT /me/location
 * The server hashes passwords, signs short-lived JWT access tokens, rotates refresh tokens
 * (re-using a rotated one revokes the session family) and locks an email after repeated failures.
 */

<<<<<<< HEAD
/** Customers suspended platform-wide by HelaMart can't sign in. */
function assertNotSuspended(user: User) {
  const record = readAdminDb().customers.find((c) => c.id === user.id || c.email === user.email)
  if (record?.status === 'blocked') throw new ApiError(403, 'Your HelaMart account is suspended. Contact HelaMart support.', 'ACCOUNT_SUSPENDED')
}

function findUserById(id: string): User | undefined {
  const user = mockAccounts.find((a) => a.user.id === id)?.user ?? readDb().extraUsers.find((u) => u.id === id)
  return user && withPreferences(user)
}

/** The account as returned to the client, including saved preferences. */
function withPreferences(user: User): User {
  const prefs = readDb().preferences[user.id]
  const out: User = { ...user }
  if (prefs?.location) out.preferredLocation = prefs.location
  if (prefs?.phone) out.phone = prefs.phone
  return out
}

/** Every account's current mobile number (to keep numbers unique to one account). */
function phoneInUse(phone: string, exceptUserId?: string) {
  const db = readDb()
  const all = [
    ...mockAccounts.map((a) => ({ id: a.user.id, phone: db.preferences[a.user.id]?.phone ?? a.user.phone })),
    ...db.extraUsers.map((u) => ({ id: u.id, phone: db.preferences[u.id]?.phone ?? u.phone })),
  ]
  const digits = (p?: string) => (p ? normalizeSriLankanMobile(p) : null)
  return all.some((a) => a.id !== exceptUserId && digits(a.phone) === phone)
}

/** Validate and normalise a customer's mobile number (required for every account). */
function cleanPhone(raw: string | undefined, userId?: string): string {
  const phone = normalizeSriLankanMobile(String(raw ?? ''))
  if (!phone) throw new ApiError(422, 'Enter your Sri Lankan mobile number, e.g. 077 123 4567.', 'BAD_PHONE')
  if (phoneInUse(phone, userId)) throw new ApiError(409, 'That mobile number is already used by another HelaMart account.', 'PHONE_TAKEN')
  return phone
}

/** PUT /me/phone — add or change the customer's mobile number. */
export async function savePhone(accessToken: string, raw: string): Promise<User> {
  await latency(150, 350)
  const user = findUserById(verifyAccessToken(accessToken))
  if (!user) throw new ApiError(401, 'Account not found.')
  const phone = cleanPhone(raw, user.id)
  const db = readDb()
  db.preferences[user.id] = { ...db.preferences[user.id], phone }
  const extra = db.extraUsers.find((u) => u.id === user.id)
  if (extra) extra.phone = phone
  writeDb(db)
  return { ...user, phone }
}

/** Validates a shopping area sent by the client (never trust coordinates or labels as-is). */
function cleanLocation(loc: ShopperLocation | undefined | null): ShopperLocation {
  if (!loc || typeof loc !== 'object') throw new ApiError(422, 'Choose your shopping area.', 'BAD_LOCATION')
  const lat = Number(loc.lat)
  const lng = Number(loc.lng)
  if (!inSriLanka(lat, lng)) throw new ApiError(422, 'Choose a location in Sri Lanka.', 'BAD_LOCATION')
  if (!(DISTRICTS as readonly string[]).includes(loc.district)) throw new ApiError(422, 'Choose a valid district.', 'BAD_LOCATION')
  const label = String(loc.label ?? '').replace(/[<>]/g, '').trim().slice(0, 60)
  if (!label) throw new ApiError(422, 'Choose your town.', 'BAD_LOCATION')
  const radiusKm = Math.min(50, Math.max(2, Math.round(Number(loc.radiusKm) || 25)))
  const source = loc.source === 'gps' || loc.source === 'map' ? loc.source : 'town'
  return { label, district: loc.district, lat: Math.round(lat * 1e4) / 1e4, lng: Math.round(lng * 1e4) / 1e4, radiusKm, source }
}

=======
>>>>>>> 8e46a242e2aecf7d41f2156e1dff89087a4c12c2
/** PUT /me/location — save (or change) the customer's shopping area. */
export function savePreferredLocation(accessToken: string, location: ShopperLocation): Promise<User> {
  return api<User>('/me/location', { method: 'PUT', body: location, token: accessToken })
}

/** POST /auth/login */
export function login(email: string, password: string, remember: boolean): Promise<AuthResult> {
  return api<AuthResult>('/auth/login', { method: 'POST', body: { email, password, remember } })
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
<<<<<<< HEAD
export async function register(input: RegisterInput, remember: boolean): Promise<AuthResult> {
  await latency(400, 800)
  const email = input.email.trim().toLowerCase()
  const name = input.name.trim().replace(/\s+/g, ' ')
  if (name.length < 3) throw new ApiError(422, 'Enter your full name.', 'BAD_NAME')
  if (!EMAIL_RE.test(email)) throw new ApiError(422, 'Enter a valid email address.', 'BAD_EMAIL')
  const phone = cleanPhone(input.phone)
  if (!isStrongPassword(input.password)) throw new ApiError(422, 'Choose a stronger password.', 'WEAK_PASSWORD')
  const location = input.location ? cleanLocation(input.location) : undefined

  const db = readDb()
  const existing = mockAccounts.find((a) => a.user.email === email)?.user ?? db.extraUsers.find((u) => u.email === email)
  if (existing) {
    const viaGoogle = existing.provider === 'google' && !db.credentials[email]
    throw new ApiError(
      409,
      viaGoogle
        ? 'This email already has an account through Google. Use “Continue with Google” to sign in.'
        : 'An account with this email already exists. Log in instead.',
      viaGoogle ? 'EMAIL_GOOGLE' : 'EMAIL_TAKEN',
    )
  }

  const user: User = {
    id: `usr_${randomId(6)}`,
    name,
    email,
    phone,
    provider: 'password',
    avatarColor: ['#174D38', '#2F6E8F', '#9E3A5A', '#B9803F', '#5F7484'][email.length % 5],
  }
  db.extraUsers.push(user)
  db.credentials[email] = { userId: user.id, passwordHash: hashPassword(email, input.password) }
  if (location) db.preferences[user.id] = { location }
  writeDb(db)
  return { user: withPreferences(user), tokens: issueSession(user, remember) }
=======
export function register(input: RegisterInput, remember: boolean): Promise<AuthResult> {
  return api<AuthResult>('/auth/register', { method: 'POST', body: { ...input, remember } })
>>>>>>> 8e46a242e2aecf7d41f2156e1dff89087a4c12c2
}

/**
 * POST /auth/google — sends Google's ID token (credential); the server verifies it with Google.
 * The simulated account chooser (email + name, no token) is only accepted by a development server.
 */
export function loginWithGoogle(
  input: { idToken: string } | { email: string; name?: string },
  remember: boolean,
): Promise<AuthResult> {
  return api<AuthResult>('/auth/google', { method: 'POST', body: { ...input, remember } })
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
