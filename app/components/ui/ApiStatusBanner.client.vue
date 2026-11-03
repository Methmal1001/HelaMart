<script setup lang="ts">
import { backendEnabled, checkHealth, useApiStatus } from '~/services/http'

/**
 * "API offline" banner: shown when the HelaMart API can't be reached (or its
 * database is down — /health returns 503). Re-checks every 20 s until it's back.
 */
const status = useApiStatus()
const checking = ref(false)
let timer: ReturnType<typeof setInterval> | null = null

async function check() {
  if (!backendEnabled() || checking.value) return
  checking.value = true
  try {
    if (await checkHealth()) status.value = 'online'
  } finally {
    checking.value = false
  }
}

onMounted(() => void check())
watch(status, (s) => {
  if (timer) clearInterval(timer)
  timer = s === 'offline' ? setInterval(() => void check(), 20000) : null
})
onBeforeUnmount(() => timer && clearInterval(timer))
</script>

<template>
  <Transition enter-active-class="transition duration-300" enter-from-class="-translate-y-full opacity-0" leave-active-class="transition duration-300" leave-to-class="-translate-y-full opacity-0">
    <div v-if="status === 'offline'" class="fixed inset-x-0 top-0 z-[60] flex items-center justify-center gap-3 bg-[#8A2E2E] px-4 py-2 text-sm text-white shadow-lg" role="alert" data-testid="api-offline">
      <AppIcon name="alert" :size="16" class="shrink-0" />
      <span>HelaMart is offline right now — we can’t reach the server. Your cart is safe; we’ll reconnect automatically.</span>
      <button type="button" class="shrink-0 rounded-md bg-white/15 px-2.5 py-1 text-xs font-bold hover:bg-white/25" :disabled="checking" @click="check">{{ checking ? 'Checking…' : 'Retry now' }}</button>
    </div>
  </Transition>
</template>
