<script lang="ts">
/** Open dialogs, top-most last (shared by every AdminModal instance). */
const modalStack: symbol[] = []
function removeFromStack(id: symbol) {
  const i = modalStack.indexOf(id)
  if (i >= 0) modalStack.splice(i, 1)
}
</script>

<script setup lang="ts">
/** Centred, accessible dialog for admin forms: focus trap, Esc to close, restores focus. */
const props = withDefaults(defineProps<{ open: boolean; title: string; description?: string; size?: 'sm' | 'md' | 'lg' | 'xl'; persistent?: boolean }>(), {
  size: 'md',
  persistent: false,
})
const emit = defineEmits<{ close: [] }>()
const box = ref<HTMLElement | null>(null)
const titleId = useId()
let previous: HTMLElement | null = null
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
const self = Symbol('modal')

watch(
  () => props.open,
  async (v) => {
    if (v) {
      previous = document.activeElement as HTMLElement | null
      modalStack.push(self)
      await nextTick()
      ;(box.value?.querySelector<HTMLElement>('[data-autofocus]') ?? box.value?.querySelector<HTMLElement>(FOCUSABLE))?.focus()
    } else {
      removeFromStack(self)
      if (previous?.isConnected) previous.focus()
    }
  },
  { immediate: true },
)

/** Esc closes the top-most dialog even when focus has drifted outside it (e.g. after its content re-rendered). */
function onDocKey(e: KeyboardEvent) {
  if (!props.open || modalStack.at(-1) !== self) return
  if (e.key === 'Escape' && !props.persistent) {
    e.preventDefault()
    emit('close')
  } else if (e.key === 'Tab' && box.value && !box.value.contains(document.activeElement)) {
    // Focus was lost (the element it was on disappeared) — bring it back into the dialog.
    e.preventDefault()
    box.value.querySelector<HTMLElement>(FOCUSABLE)?.focus()
  }
}
onMounted(() => document.addEventListener('keydown', onDocKey))
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onDocKey)
  removeFromStack(self)
})

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    // Handled by the document listener (top-most dialog only).
    e.stopPropagation()
    if (modalStack.at(-1) === self && !props.persistent) emit('close')
    return
  }
  if (e.key !== 'Tab' || !box.value) return
  const items = [...box.value.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null)
  if (!items.length) return
  if (e.shiftKey && document.activeElement === items[0]) {
    e.preventDefault()
    items.at(-1)!.focus()
  } else if (!e.shiftKey && document.activeElement === items.at(-1)) {
    e.preventDefault()
    items[0]!.focus()
  }
}

const width = computed(() => ({ sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' })[props.size])
</script>

<template>
  <Teleport to="body">
    <Transition enter-active-class="transition duration-200" enter-from-class="opacity-0" leave-active-class="pointer-events-none transition duration-150" leave-to-class="opacity-0">
      <div v-if="open" class="fixed inset-0 z-[70] grid place-items-center overflow-y-auto bg-ink/40 p-4" @mousedown.self="!persistent && emit('close')">
        <section
          ref="box"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="titleId"
          class="my-auto flex max-h-[calc(100dvh-2rem)] w-full flex-col rounded-2xl bg-warm-white shadow-float"
          :class="width"
          @keydown="onKey"
        >
          <header class="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
            <div class="min-w-0">
              <h2 :id="titleId" class="text-base font-bold text-ink">{{ title }}</h2>
              <p v-if="description" class="mt-0.5 text-xs text-muted">{{ description }}</p>
            </div>
            <button v-if="!persistent" type="button" class="grid size-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-hela-green-50" aria-label="Close" @click="emit('close')">
              <AppIcon name="close" :size="18" />
            </button>
          </header>
          <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <slot />
          </div>
          <footer v-if="$slots.footer" class="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3">
            <slot name="footer" />
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>
