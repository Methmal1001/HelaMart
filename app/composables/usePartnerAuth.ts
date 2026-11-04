import type { Partner } from '~/services/partnerService'
import { loginPartner, logoutPartner, partnerMe, registerPartner, type PartnerSession } from '~/services/partnerService'
import { ApiError } from '~/services/apiError'

/**
 * The supermarket owner's partner account ("Sell on HelaMart"). It's separate from the shopper account:
 * the API keeps it on the supermarket's row in Tenants. "Keep me signed in" → localStorage, otherwise
 * sessionStorage (cleared when the browser closes).
 */
const KEY = 'helamart:partner:v1'

type Stored = { token: string; expiresAt: number; remember: boolean; partner: Partner }
export type PartnerAuthStatus = 'unknown' | 'anonymous' | 'authenticated'

function stores(): Storage[] {
  const out: Storage[] = []
  try {
    out.push(window.localStorage, window.sessionStorage)
  } catch {
    /* blocked */
  }
  return out
}

function read(): Stored | null {
  for (const s of stores()) {
    try {
      const v = JSON.parse(s.getItem(KEY) ?? 'null') as Stored | null
      if (v && typeof v.token === 'string' && typeof v.expiresAt === 'number') return v
    } catch {
      /* corrupt entry */
    }
  }
  return null
}

function write(v: Stored | null) {
  for (const s of stores()) {
    try {
      s.removeItem(KEY)
    } catch {
      /* ignore */
    }
  }
  if (!v) return
  try {
    ;(v.remember ? window.localStorage : window.sessionStorage).setItem(KEY, JSON.stringify(v))
  } catch {
    /* storage full or blocked — the session still works for this page */
  }
}

let session: Stored | null = null
let restoring: Promise<void> | null = null
let resolver: ((ok: boolean) => void) | null = null

export function usePartnerAuth() {
  const partner = useState<Partner | null>('partner', () => null)
  const status = useState<PartnerAuthStatus>('partner-status', () => 'unknown')
  const dialogOpen = useState<boolean>('partner-dialog-open', () => false)
  const dialogReason = useState<string>('partner-dialog-reason', () => '')
  const isAuthenticated = computed(() => status.value === 'authenticated')

  function adopt(s: PartnerSession | Stored | null) {
    session = s && { token: s.token, expiresAt: s.expiresAt, remember: s.remember, partner: s.partner }
    write(session)
    partner.value = session?.partner ?? null
    status.value = session ? 'authenticated' : 'anonymous'
  }

  /** Picks up a saved partner session (once per page load) and checks it with the API. */
  function restore(): Promise<void> {
    if (import.meta.server) return Promise.resolve()
    return (restoring ??= (async () => {
      const saved = read()
      if (!saved || saved.expiresAt <= Date.now()) return adopt(null)
      adopt(saved)
      try {
        await refresh()
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) adopt(null)
      }
    })())
  }

  /** Re-reads the partner and their application from the API. */
  async function refresh() {
    if (!session) return
    adopt({ ...session, partner: await partnerMe(session.token) })
  }

  async function login(email: string, password: string, remember: boolean) {
    adopt(await loginPartner(email.trim(), password, remember))
  }

  async function register(input: { name: string; email: string; phone: string; password: string }, remember: boolean) {
    adopt(await registerPartner({ ...input, email: input.email.trim() }, remember))
  }

  async function logout() {
    const token = session?.token
    adopt(null)
    if (token) await logoutPartner(token).catch(() => undefined)
  }

  /** The partner token for API calls (throws a 401 when signed out). */
  function token(): string {
    if (!session || session.expiresAt <= Date.now()) {
      adopt(null)
      throw new ApiError(401, 'Please log in to your partner account.', 'SESSION_EXPIRED')
    }
    return session.token
  }

  /** Opens the partner log in / register dialog; resolves true once signed in, false if closed. */
  function requestLogin(why = ''): Promise<boolean> {
    dialogReason.value = why
    dialogOpen.value = true
    resolver?.(false)
    return new Promise((resolve) => (resolver = resolve))
  }

  function finishDialog(ok: boolean) {
    dialogOpen.value = false
    const r = resolver
    resolver = null
    r?.(ok)
  }

  return { partner, status, isAuthenticated, restore, refresh, login, register, logout, token, requestLogin, finishDialog, dialogOpen, dialogReason }
}
