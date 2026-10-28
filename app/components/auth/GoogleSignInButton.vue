<script setup lang="ts">
/**
 * "Continue with Google".
 * - With NUXT_PUBLIC_GOOGLE_CLIENT_ID set: renders Google Identity Services' official
 *   button and emits the ID token (credential) for the backend to verify.
 * - Without it (prototype): a Google-style button that opens the simulated account chooser.
 */
const emit = defineEmits<{ credential: [idToken: string]; mock: [] }>()
defineProps<{ disabled?: boolean }>()

interface GoogleId {
  accounts: {
    id: {
      initialize: (o: { client_id: string; callback: (r: { credential: string }) => void; ux_mode?: string }) => void
      renderButton: (el: HTMLElement, o: Record<string, unknown>) => void
    }
  }
}

const clientId = useRuntimeConfig().public.googleClientId as string
const host = ref<HTMLElement | null>(null)
const realFailed = ref(false)

function loadScript(): Promise<GoogleId> {
  const w = window as unknown as { google?: GoogleId }
  if (w.google?.accounts) return Promise.resolve(w.google)
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.async = true
    s.onload = () => (w.google ? resolve(w.google) : reject(new Error('GIS unavailable')))
    s.onerror = () => reject(new Error('GIS failed to load'))
    document.head.appendChild(s)
  })
}

onMounted(async () => {
  if (!clientId || !host.value) return
  try {
    const google = await loadScript()
    google.accounts.id.initialize({ client_id: clientId, callback: (r) => emit('credential', r.credential) })
    google.accounts.id.renderButton(host.value, {
      theme: 'outline',
      size: 'large',
      text: 'continue_with',
      shape: 'rectangular',
      width: Math.min(400, host.value.clientWidth || 320),
    })
  } catch {
    realFailed.value = true
  }
})
</script>

<template>
  <div v-if="clientId && !realFailed" ref="host" class="flex min-h-11 w-full justify-center" />
  <button
    v-else
    type="button"
    class="flex h-11 w-full items-center justify-center gap-3 rounded-xl bg-white text-sm font-semibold text-[#1f1f1f] ring-1 ring-[#dadce0] transition hover:bg-[#f8f9fa] disabled:opacity-50"
    :disabled="disabled"
    @click="emit('mock')"
  >
    <svg viewBox="0 0 48 48" class="size-5" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.5 5.8c4.4-4 6.8-10 6.8-17.2z" />
      <path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.8-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.3 2.3-6.2 0-11.5-4.1-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z" />
    </svg>
    Continue with Google
  </button>
</template>
