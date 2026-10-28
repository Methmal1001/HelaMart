export interface Toast {
  id: number
  message: string
  tone: 'default' | 'success' | 'error'
}

let nextId = 1

export function useToasts() {
  const toasts = useState<Toast[]>('toasts', () => [])

  function dismiss(id: number) {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }

  function show(message: string, tone: Toast['tone'] = 'default', duration = 2800) {
    const id = nextId++
    // Keep the stack short so toasts never cover the store.
    toasts.value = [...toasts.value.slice(-2), { id, message, tone }]
    if (import.meta.client) window.setTimeout(() => dismiss(id), duration)
  }

  return { toasts, show, dismiss }
}
