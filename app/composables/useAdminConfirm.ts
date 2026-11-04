export interface ConfirmOptions {
  title: string
  message: string
  confirmLabel?: string
  tone?: 'default' | 'danger'
  /** Ask for a free-text reason (stored in the audit log). */
  reasonLabel?: string
  /** Ask for a reason from a list too: the text becomes optional (except for "other") and defaults to the chosen label. */
  reasonOptions?: { value: string; label: string }[]
}

let resolver: ((result: { ok: boolean; reason: string; code: string }) => void) | null = null

/** Promise-based confirmation dialog for admin actions. */
export function useAdminConfirm() {
  const current = useState<ConfirmOptions | null>('admin-confirm', () => null)

  function confirm(options: ConfirmOptions): Promise<{ ok: boolean; reason: string; code: string }> {
    resolver?.({ ok: false, reason: '', code: '' })
    current.value = options
    return new Promise((r) => (resolver = r))
  }

  function settle(ok: boolean, reason = '', code = '') {
    current.value = null
    resolver?.({ ok, reason, code })
    resolver = null
  }

  return { current, confirm, settle }
}

/** Show an API error as a toast (ignoring user-cancelled step-ups). */
export function useAdminNotify() {
  const { show } = useToasts()
  return {
    ok: (msg: string) => show(msg, 'success'),
    error: (e: unknown) => {
      const err = e as { code?: string; message?: string }
      if (err?.code === 'CANCELLED') return
      show(err?.message || 'Something went wrong.', 'error', 4500)
    },
  }
}
