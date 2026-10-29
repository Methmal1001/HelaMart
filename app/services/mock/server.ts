import type { Order, ShopperLocation, User } from '~/types'
import { base64UrlEncode, decodeJwt } from '~/utils/jwt'
import { ApiError } from '../apiError'

/**
 * MOCK BACKEND — simulates what the real API will do (sign/verify tokens,
 * store refresh sessions and orders) entirely in the browser.
 * It is NOT secure: the "secret" ships to the client. Replace with real
 * endpoints; the service modules keep the same function signatures.
 */

const SECRET = 'helamart-mock-signing-key::not-for-production'
const DB_KEY = 'helamart:mock-server:v1'

export const TOKEN_POLICY = {
  /** Access tokens are short-lived (industry norm: 5–15 minutes). */
  accessTtlMs: 15 * 60 * 1000,
  /** "Keep me signed in" — refresh token lifetime. */
  rememberTtlMs: 30 * 24 * 60 * 60 * 1000,
  /** Without "keep me signed in": session ends with the browser, and at most after 12 hours. */
  sessionTtlMs: 12 * 60 * 60 * 1000,
  maxFailedLogins: 5,
  lockoutMs: 60 * 1000,
}

interface SessionRecord {
  id: string
  userId: string
  tokenHash: string
  expiresAt: number
  remember: boolean
  revoked: boolean
  /** Set when this token was exchanged for a new one (rotation). */
  replacedBy?: string
  familyId: string
}

interface Db {
  sessions: SessionRecord[]
  orders: Order[]
  /** Customers created at runtime (registration or first Google sign-in). */
  extraUsers: User[]
  /** email → salted password hash, for accounts registered with a password. */
  credentials: Record<string, { userId: string; passwordHash: string }>
  failedLogins: Record<string, { count: number; until: number }>
  /** Per-customer preferences (e.g. saved shopping area), keyed by user id. */
  preferences: Record<string, { location?: ShopperLocation }>
}

function emptyDb(): Db {
  return { sessions: [], orders: [], extraUsers: [], credentials: {}, failedLogins: {}, preferences: {} }
}

/** Mock password hashing (a real backend uses bcrypt/argon2). */
export function hashPassword(email: string, password: string) {
  return hash(`pw:${email.toLowerCase()}:${password}`)
}

export function readDb(): Db {
  try {
    const raw = localStorage.getItem(DB_KEY)
    return raw ? { ...emptyDb(), ...(JSON.parse(raw) as Db) } : emptyDb()
  } catch {
    return emptyDb()
  }
}

export function writeDb(db: Db) {
  // Drop dead sessions so storage doesn't grow forever.
  const now = Date.now()
  db.sessions = db.sessions.filter((s) => s.expiresAt > now)
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db))
  } catch {
    /* storage unavailable */
  }
}

/** Simulated network latency. */
export function latency(min = 250, max = 650) {
  return new Promise((r) => setTimeout(r, min + Math.random() * (max - min)))
}

// --- hashing / signing (deterministic, NOT cryptographically secure) ---

function cyrb53(str: string, seed = 0) {
  let h1 = 0xdeadbeef ^ seed
  let h2 = 0x41c6ce57 ^ seed
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0')
}

export function hash(value: string) {
  return cyrb53(value, 1) + cyrb53(value, 2) + cyrb53(value, 3)
}

export function randomId(bytes = 24) {
  const a = new Uint8Array(bytes)
  crypto.getRandomValues(a)
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function signAccessToken(user: User, now = Date.now()) {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const exp = now + TOKEN_POLICY.accessTtlMs
  const payload = base64UrlEncode(
    JSON.stringify({
      iss: 'helamart-mock',
      aud: 'helamart-web',
      sub: user.id,
      email: user.email,
      name: user.name,
      provider: user.provider,
      typ: 'access',
      iat: Math.floor(now / 1000),
      exp: Math.floor(exp / 1000),
      jti: randomId(8),
    }),
  )
  const signature = hash(`${header}.${payload}.${SECRET}`)
  return { token: `${header}.${payload}.${signature}`, expiresAt: exp }
}

/** Server-side check of an access token: signature, type and expiry. Returns the user id. */
export function verifyAccessToken(token: string | null | undefined): string {
  if (!token) throw new ApiError(401, 'Authentication required.', 'NO_TOKEN')
  const [header, payload, signature] = token.split('.')
  if (!header || !payload || !signature || hash(`${header}.${payload}.${SECRET}`) !== signature) {
    throw new ApiError(401, 'Invalid access token.', 'BAD_TOKEN')
  }
  const claims = decodeJwt(token)
  if (!claims || claims.typ !== 'access') throw new ApiError(401, 'Invalid access token.', 'BAD_TOKEN')
  if (claims.exp * 1000 <= Date.now()) throw new ApiError(401, 'Access token expired.', 'TOKEN_EXPIRED')
  return claims.sub
}
