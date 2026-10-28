import type { AuthResult, AuthTokens, User } from '~/types'
import { mockAccounts } from '~/data/mockUsers'
import { decodeJwt } from '~/utils/jwt'
import { ApiError } from './apiError'
import { EMAIL_RE, isSriLankanMobile, isStrongPassword } from '~/utils/validation'
import { TOKEN_POLICY, hash, hashPassword, latency, randomId, readDb, signAccessToken, verifyAccessToken, writeDb } from './mock/server'

/**
 * Auth API. Every function maps 1:1 to a future backend endpoint:
 *   POST /auth/register · POST /auth/login · POST /auth/google · POST /auth/refresh · POST /auth/logout · GET /auth/me
 * Only the bodies change when the backend exists.
 */

function findUserById(id: string): User | undefined {
  return mockAccounts.find((a) => a.user.id === id)?.user ?? readDb().extraUsers.find((u) => u.id === id)
}

function issueSession(user: User, remember: boolean, familyId = randomId(8), absoluteExpiry?: number): AuthTokens {
  const now = Date.now()
  const access = signAccessToken(user, now)
  const refreshToken = randomId(32)
  const refreshExpiresAt = absoluteExpiry ?? now + (remember ? TOKEN_POLICY.rememberTtlMs : TOKEN_POLICY.sessionTtlMs)
  const db = readDb()
  db.sessions.push({
    id: randomId(8),
    userId: user.id,
    tokenHash: hash(refreshToken),
    expiresAt: refreshExpiresAt,
    remember,
    revoked: false,
    familyId,
  })
  writeDb(db)
  return { accessToken: access.token, refreshToken, accessExpiresAt: access.expiresAt, refreshExpiresAt, remember }
}

/** POST /auth/login */
export async function login(email: string, password: string, remember: boolean): Promise<AuthResult> {
  await latency()
  const key = email.trim().toLowerCase()
  const db = readDb()
  const lock = db.failedLogins[key]
  if (lock && lock.count >= TOKEN_POLICY.maxFailedLogins && lock.until > Date.now()) {
    const secs = Math.ceil((lock.until - Date.now()) / 1000)
    throw new ApiError(429, `Too many attempts. Try again in ${secs} seconds.`, 'LOCKED')
  }
  // Seeded test accounts, then customers who registered in this browser.
  const seeded = mockAccounts.find((a) => a.user.email === key && a.password)
  const registered = db.credentials[key]
  let user: User | undefined
  if (seeded && seeded.password === password) user = seeded.user
  else if (registered && registered.passwordHash === hashPassword(key, password)) {
    user = db.extraUsers.find((u) => u.id === registered.userId)
  }
  if (!user) {
    const count = (lock && lock.until > Date.now() ? lock.count : 0) + 1
    db.failedLogins[key] = { count, until: Date.now() + TOKEN_POLICY.lockoutMs }
    writeDb(db)
    // Same message for unknown email and wrong password — don't reveal which accounts exist.
    throw new ApiError(401, 'Incorrect email or password.', 'BAD_CREDENTIALS')
  }
  delete db.failedLogins[key]
  writeDb(db)
  return { user, tokens: issueSession(user, remember) }
}

export interface RegisterInput {
  name: string
  email: string
  phone: string
  password: string
}

/** POST /auth/register — creates a customer account and signs it in. */
export async function register(input: RegisterInput, remember: boolean): Promise<AuthResult> {
  await latency(400, 800)
  const email = input.email.trim().toLowerCase()
  const name = input.name.trim().replace(/\s+/g, ' ')
  if (name.length < 3) throw new ApiError(422, 'Enter your full name.', 'BAD_NAME')
  if (!EMAIL_RE.test(email)) throw new ApiError(422, 'Enter a valid email address.', 'BAD_EMAIL')
  if (input.phone && !isSriLankanMobile(input.phone)) throw new ApiError(422, 'Enter a Sri Lankan mobile number, e.g. 077 123 4567.', 'BAD_PHONE')
  if (!isStrongPassword(input.password)) throw new ApiError(422, 'Choose a stronger password.', 'WEAK_PASSWORD')

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
    phone: input.phone.trim() || undefined,
    provider: 'password',
    avatarColor: ['#174D38', '#2F6E8F', '#9E3A5A', '#B9803F', '#5F7484'][email.length % 5],
  }
  db.extraUsers.push(user)
  db.credentials[email] = { userId: user.id, passwordHash: hashPassword(email, input.password) }
  writeDb(db)
  return { user, tokens: issueSession(user, remember) }
}

/**
 * POST /auth/google — the client sends Google's ID token (credential).
 * The real backend MUST verify it with Google (signature, `aud` = our client id, expiry)
 * before trusting any claim. The mock only decodes it, or accepts a test account email.
 */
export async function loginWithGoogle(
  input: { idToken: string } | { email: string; name?: string },
  remember: boolean,
): Promise<AuthResult> {
  await latency()
  let email: string
  let name: string | undefined
  let picture: string | undefined
  if ('idToken' in input) {
    const claims = decodeJwt<{ email?: string; name?: string; picture?: string; email_verified?: boolean }>(input.idToken)
    if (!claims?.email || claims.email_verified === false) throw new ApiError(401, 'Google sign-in failed.', 'GOOGLE_INVALID')
    email = claims.email.toLowerCase()
    name = claims.name
    picture = claims.picture
  } else {
    email = input.email.trim().toLowerCase()
    name = input.name
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(400, 'Enter a valid Google email address.', 'BAD_EMAIL')

  let user = mockAccounts.find((a) => a.user.email === email)?.user
  if (!user) {
    // First Google sign-in for this email: create the customer account.
    const db = readDb()
    user = db.extraUsers.find((u) => u.email === email)
    if (!user) {
      user = {
        id: `usr_g_${hash(email).slice(0, 10)}`,
        name: name || email.split('@')[0]!,
        email,
        provider: 'google',
        pictureUrl: picture,
        avatarColor: '#174D38',
      }
      db.extraUsers.push(user)
      writeDb(db)
    }
  }
  return { user, tokens: issueSession(user, remember) }
}

/**
 * POST /auth/refresh — exchanges a refresh token for a new pair (rotation).
 * Re-using an already-rotated token signals theft: the whole session family is revoked.
 */
export async function refresh(refreshToken: string): Promise<AuthResult> {
  await latency(120, 300)
  const db = readDb()
  const record = db.sessions.find((s) => s.tokenHash === hash(refreshToken))
  if (!record) throw new ApiError(401, 'Session not found.', 'SESSION_INVALID')
  if (record.revoked) {
    if (record.replacedBy) db.sessions.forEach((s) => s.familyId === record.familyId && (s.revoked = true))
    writeDb(db)
    throw new ApiError(401, 'Session has been revoked.', 'SESSION_REVOKED')
  }
  if (record.expiresAt <= Date.now()) throw new ApiError(401, 'Session expired.', 'SESSION_EXPIRED')
  const user = findUserById(record.userId)
  if (!user) throw new ApiError(401, 'Account not found.', 'SESSION_INVALID')

  // The new refresh token keeps the original absolute expiry (no endless sliding sessions).
  const tokens = issueSession(user, record.remember, record.familyId, record.expiresAt)
  const db2 = readDb()
  const old = db2.sessions.find((s) => s.id === record.id)
  if (old) {
    old.revoked = true
    old.replacedBy = hash(tokens.refreshToken)
  }
  writeDb(db2)
  return { user, tokens }
}

/** POST /auth/logout — revokes the refresh token. */
export async function logout(refreshToken: string | null): Promise<void> {
  await latency(80, 200)
  if (!refreshToken) return
  const db = readDb()
  const record = db.sessions.find((s) => s.tokenHash === hash(refreshToken))
  if (record) record.revoked = true
  writeDb(db)
}

/** GET /auth/me */
export async function me(accessToken: string): Promise<User> {
  await latency(80, 200)
  const user = findUserById(verifyAccessToken(accessToken))
  if (!user) throw new ApiError(401, 'Account not found.')
  return user
}
