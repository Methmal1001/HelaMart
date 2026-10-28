/** Minimal JWT helpers for reading claims on the client (never for trusting them). */

export function base64UrlEncode(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  bytes.forEach((b) => (bin += String.fromCharCode(b)))
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function base64UrlDecode(input: string): string {
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(input.length / 4) * 4, '=')
  const bin = atob(b64)
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))
}

export interface JwtClaims {
  sub: string
  exp: number
  iat: number
  [key: string]: unknown
}

/** Decode a JWT payload without verifying it. Returns null when malformed. */
export function decodeJwt<T extends Record<string, unknown> = JwtClaims>(token: string): T | null {
  try {
    const [, payload] = token.split('.')
    if (!payload) return null
    return JSON.parse(base64UrlDecode(payload)) as T
  } catch {
    return null
  }
}
