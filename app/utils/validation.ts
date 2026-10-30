/** Shared form rules — used by the registration form and enforced again by the (mock) API. */

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Sri Lankan mobile: 07X XXX XXXX, optionally +94 / 94 prefixed. */
export function isSriLankanMobile(value: string) {
  return /^(\+?94|0)?7\d{8}$/.test(value.replace(/[\s-]/g, ''))
}

/** "0771234567" / "+94 77 123 4567" → "+94 77 123 4567" (null when not a Sri Lankan mobile). */
export function normalizeSriLankanMobile(value: string): string | null {
  const d = value.replace(/[\s-]/g, '').replace(/^\+?94|^0/, '')
  if (!/^7\d{8}$/.test(d)) return null
  return `+94 ${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5)}`
}

export const PASSWORD_RULES: { id: string; label: string; test: (pw: string) => boolean }[] = [
  { id: 'length', label: 'At least 8 characters', test: (pw) => pw.length >= 8 },
  { id: 'letter', label: 'Upper- and lower-case letters', test: (pw) => /[a-z]/.test(pw) && /[A-Z]/.test(pw) },
  { id: 'number', label: 'At least one number', test: (pw) => /\d/.test(pw) },
]

/** Stricter policy for staff accounts (length comes from the security settings). */
export function staffPasswordRules(minLength: number, email?: string) {
  const rules = [
    { id: 'length', label: `At least ${minLength} characters`, test: (pw: string) => pw.length >= minLength },
    { id: 'case', label: 'Upper- and lower-case letters', test: (pw: string) => /[a-z]/.test(pw) && /[A-Z]/.test(pw) },
    { id: 'number', label: 'At least one number', test: (pw: string) => /\d/.test(pw) },
    { id: 'symbol', label: 'At least one symbol (e.g. @ # ! %)', test: (pw: string) => /[^A-Za-z0-9]/.test(pw) },
  ]
  const name = email?.split('@')[0]?.toLowerCase()
  if (name && name.length >= 3) {
    rules.push({ id: 'name', label: 'Doesn’t contain your email name', test: (pw: string) => !!pw && !pw.toLowerCase().includes(name) })
  }
  return rules
}

export function isStrongPassword(pw: string) {
  return PASSWORD_RULES.every((r) => r.test(pw))
}
