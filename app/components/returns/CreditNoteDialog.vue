<script setup lang="ts">
import type { ReturnRequest } from '~/types/returns'

/** A refunded return's credit note, over everything else, with Print (prints only the credit note). */
const { ret, store = false } = defineProps<{ ret: ReturnRequest | null; store?: boolean }>()
const emit = defineEmits<{ close: [] }>()
const closeBtn = ref<HTMLButtonElement | null>(null)

watch(() => ret, async (r) => {
  if (!r) return
  await nextTick()
  closeBtn.value?.focus()
})

function print() {
  document.body.classList.add('printing-credit-note')
  window.print()
  document.body.classList.remove('printing-credit-note')
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && ret) emit('close')
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <div v-if="ret?.creditNote" class="fixed inset-0 z-[80] grid place-items-center bg-ink/50 p-3 backdrop-blur-sm sm:p-6" @click.self="emit('close')">
      <div class="flex max-h-[92dvh] w-full max-w-xl flex-col overflow-hidden rounded-3xl bg-warm-white shadow-float ring-1 ring-line" role="dialog" aria-modal="true" :aria-label="`Credit note ${ret.creditNote.number}`" data-testid="credit-note-dialog">
        <header class="flex items-center gap-3 border-b border-line bg-white px-5 py-3">
          <span class="grid size-9 shrink-0 place-items-center rounded-xl bg-hela-green text-hela-gold"><AppIcon name="receipt" :size="18" /></span>
          <p class="min-w-0 flex-1 truncate font-extrabold text-ink">Credit note {{ ret.creditNote.number }}</p>
          <button type="button" class="btn-ghost h-9 text-sm" data-testid="credit-note-print" @click="print"><AppIcon name="printer" :size="15" />Print</button>
          <button ref="closeBtn" type="button" class="grid size-9 place-items-center rounded-xl text-muted ring-1 ring-line hover:bg-hela-green-50" aria-label="Close" @click="emit('close')">
            <AppIcon name="close" :size="18" />
          </button>
        </header>
        <div class="overflow-y-auto p-4 sm:p-5">
          <CreditNoteDocument :note="ret.creditNote" :ret="ret" :store="store" />
        </div>
      </div>
    </div>
  </Teleport>
</template>
