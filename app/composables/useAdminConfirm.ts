export interface ConfirmOptions {
  title: string
  message: string
  confirmLabel?: string
  tone?: 'default' | 'danger'
  /** Ask for a free-text reason (stored in the audit log). */
  reasonLabel?: string
}

let resolver: ((result: { ok: boolean; reason: string }) => void) | null = null

/** Promise-based confirmation dialog for admin actions. */
export function useAdminConfirm() {
  const current = useState<ConfirmOptions | null>('admin-confirm', () => null)

  function confirm(options: ConfirmOptions): Promise<{ ok: boolean; reason: string }> {
    resolver?.({ ok: false, reason: '' })
    current.value = options
    return new Promise((r) => (resolver = r))
  }

  function settle(ok: boolean, reason = '') {
    current.value = null
    resolver?.({ ok, reason })
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
