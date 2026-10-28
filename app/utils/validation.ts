/** Shared form rules — used by the registration form and enforced again by the (mock) API. */

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Sri Lankan mobile: 07X XXX XXXX, optionally +94 / 94 prefixed. */
export function isSriLankanMobile(value: string) {
  return /^(\+?94|0)?7\d{8}$/.test(value.replace(/[\s-]/g, ''))
}

export const PASSWORD_RULES: { id: string; label: string; test: (pw: string) => boolean }[] = [
  { id: 'length', label: 'At least 8 characters', test: (pw) => pw.length >= 8 },
  { id: 'letter', label: 'Upper- and lower-case letters', test: (pw) => /[a-z]/.test(pw) && /[A-Z]/.test(pw) },
  { id: 'number', label: 'At least one number', test: (pw) => /\d/.test(pw) },
]

export function isStrongPassword(pw: string) {
  return PASSWORD_RULES.every((r) => r.test(pw))
}
