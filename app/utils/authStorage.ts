import type { AuthTokens } from '~/types'

/**
 * Where the signed-in customer's tokens are kept:
 *  - "Keep me signed in" (remember: true) → localStorage, so the session survives
 *    closing the browser (until the refresh token expires);
 *  - otherwise → sessionStorage, cleared when the tab/browser closes.
 * Only one of the two ever holds tokens.
 */
const KEY = 'helamart:auth:v1'

function stores(): Storage[] {
  if (typeof window === 'undefined') return []
  const out: Storage[] = []
  try {
    out.push(window.localStorage)
  } catch {
    /* blocked */
  }
  try {
    out.push(window.sessionStorage)
  } catch {
    /* blocked */
  }
  return out
}

function valid(t: unknown): t is AuthTokens {
  const x = t as AuthTokens
  return !!x && typeof x.accessToken === 'string' && typeof x.refreshToken === 'string' && typeof x.accessExpiresAt === 'number' && typeof x.refreshExpiresAt === 'number'
}

export function readAuthTokens(): AuthTokens | null {
  for (const s of stores()) {
    try {
      const raw = s.getItem(KEY)
      if (!raw) continue
      const t = JSON.parse(raw) as unknown
      if (valid(t)) return t
    } catch {
      /* corrupt entry */
    }
  }
  return null
}

export function writeAuthTokens(tokens: AuthTokens) {
  const [local, session] = stores()
  const target = tokens.remember ? local : session
  const other = tokens.remember ? session : local
  try {
    other?.removeItem(KEY)
    target?.setItem(KEY, JSON.stringify(tokens))
  } catch {
    /* storage full or blocked — the session still works for this page */
  }
}

export function clearAuthTokens() {
  for (const s of stores()) {
    try {
      s.removeItem(KEY)
    } catch {
      /* ignore */
    }
  }
}

/** The localStorage key (another tab signing in/out changes it). */
export const AUTH_STORAGE_KEY = KEY
