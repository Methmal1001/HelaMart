let resolver: ((ok: boolean) => void) | null = null

/** Opens the login dialog and resolves once the shopper signs in (true) or cancels (false). */
export function useAuthDialog() {
  const open = useState<boolean>('auth-dialog-open', () => false)
  const reason = useState<string>('auth-dialog-reason', () => '')
  const { isAuthenticated } = useAuth()

  function requestLogin(why = ''): Promise<boolean> {
    reason.value = why
    open.value = true
    resolver?.(false)
    return new Promise((resolve) => (resolver = resolve))
  }

  function finish(ok: boolean) {
    open.value = false
    const r = resolver
    resolver = null
    r?.(ok)
  }

  /** Resolves true immediately when signed in, otherwise asks the shopper to log in. */
  async function requireAuth(why: string) {
    return isAuthenticated.value ? true : requestLogin(why)
  }

  return { open, reason, requestLogin, requireAuth, finish }
}
