<script setup lang="ts">
/**
 * Accessible slide-in dialog: focus moves in on open and back on close,
 * Tab is trapped inside, Esc and the backdrop close it.
 */
const props = withDefaults(
  defineProps<{ open: boolean; title: string; side?: 'right' | 'left' | 'bottom'; width?: string }>(),
  { side: 'right', width: 'sm:max-w-md' },
)
const emit = defineEmits<{ close: [] }>()

const panel = ref<HTMLElement | null>(null)
let previouslyFocused: HTMLElement | null = null
const titleId = useId()

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'

watch(
  () => props.open,
  async (open) => {
    if (open) {
      previouslyFocused = document.activeElement as HTMLElement | null
      await nextTick()
      const first = panel.value?.querySelector<HTMLElement>('[data-autofocus]') ?? panel.value?.querySelector<HTMLElement>(FOCUSABLE)
      first?.focus({ preventScroll: true })
    } else {
      previouslyFocused?.focus?.({ preventScroll: true })
    }
  },
)

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.stopPropagation()
    emit('close')
    return
  }
  if (e.key !== 'Tab' || !panel.value) return
  const items = [...panel.value.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null)
  if (!items.length) return
  const first = items[0]!
  const last = items[items.length - 1]!
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault()
    first.focus()
  }
}

const position = computed(() => {
  if (props.side === 'bottom') return 'inset-x-0 bottom-0 max-h-[88dvh] rounded-t-3xl'
  const base = `inset-y-0 w-full ${props.width}`
  return props.side === 'left' ? `${base} left-0 sm:rounded-r-3xl` : `${base} right-0 sm:rounded-l-3xl`
})

const enterFrom = computed(() =>
  props.side === 'bottom' ? 'translate-y-full' : props.side === 'left' ? '-translate-x-full' : 'translate-x-full',
)
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-200"
      leave-active-class="pointer-events-none transition-opacity duration-200"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <div v-if="open" class="fixed inset-0 z-40 bg-ink/30" aria-hidden="true" @click="emit('close')" />
    </Transition>
    <Transition
      enter-active-class="transition-transform duration-300 ease-[cubic-bezier(.2,.8,.2,1)]"
      leave-active-class="pointer-events-none transition-transform duration-200 ease-in"
      :enter-from-class="enterFrom"
      :leave-to-class="enterFrom"
    >
      <section
        v-if="open"
        ref="panel"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        class="fixed z-50 flex flex-col bg-warm-white shadow-float"
        :class="position"
        @keydown="onKeydown"
      >
        <header class="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div class="min-w-0">
            <h2 :id="titleId" class="truncate text-lg font-bold tracking-tight text-ink">{{ title }}</h2>
            <slot name="subtitle" />
          </div>
          <button type="button" class="btn-icon size-10" aria-label="Close" @click="emit('close')">
            <AppIcon name="close" />
          </button>
        </header>
        <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <slot />
        </div>
        <footer v-if="$slots.footer" class="border-t border-line bg-white px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <slot name="footer" />
        </footer>
      </section>
    </Transition>
  </Teleport>
</template>
