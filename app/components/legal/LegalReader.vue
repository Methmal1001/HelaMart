<script setup lang="ts">
import { LEGAL, type LegalKey } from '~/data/legal'

/**
 * Full-screen reader for the Terms of Order and Privacy Policy, above any open panel. When opened to accept,
 * "I agree" unlocks once the customer has scrolled to the end (reading progress is shown at the top).
 */
const { openDoc, acceptable, close } = useLegal()
const body = ref<HTMLElement | null>(null)
const closeBtn = ref<HTMLButtonElement | null>(null)
const progress = ref(0)
const reachedEnd = ref(false)

const doc = computed(() => (openDoc.value ? LEGAL[openDoc.value] : null))
const TABS: { key: LegalKey; label: string; icon: 'clipboard' | 'shield' }[] = [
  { key: 'terms', label: 'Terms of Order', icon: 'clipboard' },
  { key: 'privacy', label: 'Privacy Policy', icon: 'shield' },
]

function onScroll() {
  const el = body.value
  if (!el) return
  const max = el.scrollHeight - el.clientHeight
  progress.value = max <= 0 ? 1 : Math.min(1, el.scrollTop / max)
  if (progress.value > 0.97) reachedEnd.value = true
}

watch(openDoc, async (k) => {
  if (!k) return
  progress.value = 0
  reachedEnd.value = false
  await nextTick()
  body.value?.scrollTo({ top: 0 })
  onScroll()
  closeBtn.value?.focus()
})

function jump(id: string) {
  body.value?.querySelector(`#${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
function toEnd() {
  body.value?.scrollTo({ top: body.value.scrollHeight, behavior: 'smooth' })
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && openDoc.value) close(false)
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <Transition enter-active-class="transition duration-200" enter-from-class="opacity-0" leave-active-class="transition duration-150" leave-to-class="opacity-0">
      <div v-if="doc" class="fixed inset-0 z-[70] grid place-items-center bg-ink/50 p-3 backdrop-blur-sm sm:p-6" @click.self="close(false)">
        <div
          class="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-warm-white shadow-float ring-1 ring-line"
          role="dialog"
          aria-modal="true"
          :aria-label="doc.title"
          data-testid="legal-reader"
        >
          <!-- Header -->
          <header class="relative border-b border-line bg-white px-5 pt-4 pb-3">
            <div class="flex items-start gap-3">
              <span class="grid size-10 shrink-0 place-items-center rounded-2xl bg-hela-green text-hela-gold"><AppIcon :name="doc.key === 'terms' ? 'clipboard' : 'shield'" :size="20" /></span>
              <div class="min-w-0 flex-1">
                <p class="text-[0.68rem] font-extrabold tracking-[0.14em] text-hela-green uppercase">HelaMart legal</p>
                <h2 class="truncate text-lg font-extrabold tracking-[-0.02em] text-ink">{{ doc.title }}</h2>
              </div>
              <button ref="closeBtn" type="button" class="grid size-9 place-items-center rounded-xl text-muted ring-1 ring-line hover:bg-hela-green-50" aria-label="Close" @click="close(false)">
                <AppIcon name="close" :size="18" />
              </button>
            </div>
            <div class="mt-3 grid grid-cols-2 rounded-xl bg-hela-green-50 p-1" role="tablist" aria-label="Document">
              <button
                v-for="t in TABS"
                :key="t.key"
                type="button"
                role="tab"
                :aria-selected="openDoc === t.key"
                :disabled="acceptable && openDoc !== t.key"
                class="flex h-8 items-center justify-center gap-1.5 rounded-lg text-xs font-bold transition disabled:cursor-default disabled:opacity-50"
                :class="openDoc === t.key ? 'bg-white text-hela-green shadow-card' : 'text-muted hover:text-ink'"
                @click="openDoc = t.key"
              >
                <AppIcon :name="t.icon" :size="13" />{{ t.label }}
              </button>
            </div>
            <!-- Reading progress -->
            <div class="absolute inset-x-0 bottom-0 h-1 bg-line/60" aria-hidden="true">
              <div class="h-full bg-hela-gold transition-[width] duration-150" :style="{ width: `${Math.round(progress * 100)}%` }" />
            </div>
          </header>

          <!-- Body -->
          <div ref="body" class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5" tabindex="0" @scroll.passive="onScroll">
            <LegalDocument :doc="doc" :id-prefix="`reader-${doc.key}`" @jump="jump" />
            <p class="mt-6 flex items-center gap-2 rounded-xl bg-white px-3.5 py-2.5 text-xs text-muted ring-1 ring-line">
              <AppIcon name="info" :size="14" class="shrink-0" />End of the {{ doc.title }}. You can read it any time at
              <NuxtLink :to="`/legal/${doc.key}`" class="font-bold text-hela-green underline" target="_blank">helamart.lk/legal/{{ doc.key }}</NuxtLink>.
            </p>
          </div>

          <!-- Footer -->
          <footer class="flex flex-wrap items-center gap-3 border-t border-line bg-white px-5 py-3.5">
            <template v-if="acceptable">
              <p class="min-w-0 flex-1 text-xs text-muted" aria-live="polite">
                <template v-if="reachedEnd"><AppIcon name="check" :size="13" :stroke-width="3" class="inline text-hela-green" /> Thanks for reading.</template>
                <template v-else>Scroll to the end to agree · <button type="button" class="font-bold text-hela-green underline" @click="toEnd">Go to end</button></template>
              </p>
              <button type="button" class="btn-ghost h-11 px-4" @click="close(false)">Not now</button>
              <button type="button" class="btn-primary h-11 px-5" :disabled="!reachedEnd" data-testid="legal-agree" @click="close(true)">
                <AppIcon name="check" :size="16" :stroke-width="3" />I agree
              </button>
            </template>
            <template v-else>
              <p class="min-w-0 flex-1 text-xs text-muted">Version {{ doc.version }} · Effective {{ doc.effective }}</p>
              <button type="button" class="btn-primary h-11 px-5" @click="close(false)">Done</button>
            </template>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
