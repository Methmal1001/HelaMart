import type { AuthTokens } from '~/types'
import { base64UrlDecode, base64UrlEncode } from './jwt'

/**
 * Session cookie holding the token pair.
 *  - SameSite=Strict, Path=/, Secure on HTTPS.
 *  - "Keep me signed in" → persistent until the refresh token expires;
 *    otherwise a browser-session cookie (cleared when the browser closes).
 * When the real backend exists, the refresh token should move to an
 * HttpOnly cookie set by the server — JavaScript must not be able to read it.
 */
const NAME = 'helamart_session'

export function readAuthCookie(): AuthTokens | null {
  if (typeof document === 'undefined') return null
  const raw = document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${NAME}=`))
    ?.slice(NAME.length + 1)
  if (!raw) return null
  try {
    const t = JSON.parse(base64UrlDecode(raw)) as AuthTokens
    if (typeof t.accessToken !== 'string' || typeof t.refreshToken !== 'string') return null
    return t
  } catch {
    return null
  }
}

export function writeAuthCookie(tokens: AuthTokens) {
  const value = base64UrlEncode(JSON.stringify(tokens))
  const secure = location.protocol === 'https:' ? '; Secure' : ''
  const maxAge = tokens.remember ? `; Max-Age=${Math.max(0, Math.floor((tokens.refreshExpiresAt - Date.now()) / 1000))}` : ''
  document.cookie = `${NAME}=${value}; Path=/; SameSite=Strict${maxAge}${secure}`
}

export function clearAuthCookie() {
  document.cookie = `${NAME}=; Path=/; SameSite=Strict; Max-Age=0`
}
