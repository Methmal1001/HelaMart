/**
 * Defensive localStorage helpers. Storage can be unavailable (private mode,
 * blocked cookies, quota) — the app must keep working without it.
 */
export const STORAGE_KEYS = {
  cart: 'helamart:cart:v1',
  avatar: 'helamart:avatar:v1',
  quality: 'helamart:quality:v1',
} as const

export function readStorage<T>(key: string, validate: (value: unknown) => value is T): T | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(key)
    if (raw == null) return null
    const parsed: unknown = JSON.parse(raw)
    return validate(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function writeStorage(key: string, value: unknown): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage full or blocked — persistence is a convenience, not a requirement.
  }
}
