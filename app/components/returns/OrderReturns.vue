<script setup lang="ts">
import type { Order } from '~/types'
import type { Resolution, Returnable, ReturnReason, ReturnRequest } from '~/types/returns'
import { createReturn, escalateReturn, myReturnPhoto, returnable, withdrawReturn } from '~/services/returnService'
import { ApiError } from '~/services/apiError'
import { ImageRejected, prepareEvidencePhoto } from '~/utils/imageProcessing'
import { RETURN_TONE } from '~/composables/useMyReturns'

/**
 * On a delivered / collected bill: "Report a problem" (which items, how many, why, photos) and the order's
 * return requests with the store's decision and the refund.
 */
const { order } = defineProps<{ order: Order }>()
const { authorized } = useAuth()
const { forOrder, upsert, load: loadReturns } = useMyReturns()
const { load: loadCredit } = useStoreCredit()
/** The refunded return whose credit note is open. */
const noteOf = ref<ReturnRequest | null>(null)
const { show } = useToasts()

const info = ref<Returnable | null>(null)
const requests = computed(() => forOrder(order.id))
// A refund may have gone to store credit: keep the balance current.
watch(() => requests.value.filter((r) => r.status === 'refunded').length, (n, was) => n > (was ?? 0) && loadCredit())
const formOpen = ref(false)
const busy = ref(false)
const error = ref('')
const picks = reactive<Record<number, { on: boolean; quantity: number; reason: ReturnReason | '' }>>({})
const note = ref('')
const resolution = ref<Resolution>('refund')
const photos = ref<string[]>([])
const photoError = ref('')

async function refresh() {
  try {
    info.value = await authorized((t) => returnable(t, order.id))
  } catch {
    info.value = null
  }
}
watch(() => `${order.id}|${order.received?.at ?? ''}|${requests.value.length}`, refresh, { immediate: true })

function openForm() {
  error.value = ''
  note.value = ''
  resolution.value = 'refund'
  photos.value = []
  photoError.value = ''
  for (const l of info.value?.lines ?? []) picks[l.lineNumber] = { on: false, quantity: Math.min(1, l.returnableQuantity), reason: '' }
  formOpen.value = true
}

const chosen = computed(() => (info.value?.lines ?? []).filter((l) => picks[l.lineNumber]?.on && l.returnableQuantity > 0))
const needsPhoto = computed(() => chosen.value.some((l) => info.value!.photoReasons.includes(picks[l.lineNumber]!.reason as ReturnReason)))
/** What the chosen items would refund (the store confirms the final amount). */
const estimate = computed(() => chosen.value.reduce((sum, l) => sum + Math.round((l.paidCents * picks[l.lineNumber]!.quantity) / l.quantity), 0))
const deadlineText = computed(() => (info.value?.deadline ? new Intl.DateTimeFormat('en-LK', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(info.value.deadline)) : ''))

async function addPhotos(e: Event) {
  const input = e.target as HTMLInputElement
  photoError.value = ''
  for (const file of Array.from(input.files ?? [])) {
    if (photos.value.length >= 4) {
      photoError.value = 'Up to 4 photos.'
      break
    }
    try {
      photos.value = [...photos.value, await prepareEvidencePhoto(file)]
      error.value = ''
    } catch (err) {
      photoError.value = err instanceof ImageRejected ? err.message : 'That photo couldn’t be added.'
    }
  }
  input.value = ''
}

async function submit() {
  error.value = ''
  if (!chosen.value.length) return (error.value = 'Tick the items you have a problem with.')
  const noReason = chosen.value.find((l) => !picks[l.lineNumber]!.reason)
  if (noReason) return (error.value = `Choose what’s wrong with ${noReason.name}.`)
  if (needsPhoto.value && !photos.value.length) return (error.value = 'Please add a photo of the problem — it helps the store approve your refund quickly.')
  busy.value = true
  try {
    const r = await authorized((t) =>
      createReturn(t, order.id, {
        items: chosen.value.map((l) => ({ lineNumber: l.lineNumber, quantity: picks[l.lineNumber]!.quantity, reason: picks[l.lineNumber]!.reason as ReturnReason })),
        note: note.value,
        photos: photos.value,
        resolution: resolution.value,
      }),
    )
    upsert(r)
    formOpen.value = false
    show(`Sent to ${order.storeName ?? 'the store'} — request ${r.number}. We’ll show their reply here.`, 'success', 4500)
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Couldn’t send your request. Please try again.'
  } finally {
    busy.value = false
  }
}

// ---- ask HelaMart to review
const reviewFor = ref<string | null>(null)
const reviewReason = ref('')
async function escalate(r: ReturnRequest) {
  busy.value = true
  try {
    upsert(await authorized((t) => escalateReturn(t, r.id, reviewReason.value)))
    reviewFor.value = null
    reviewReason.value = ''
    show('HelaMart support will review it and reply within 2 working days.', 'success', 4500)
  } catch (e) {
    show(e instanceof ApiError ? e.message : 'Couldn’t send it. Please try again.', 'error')
  } finally {
    busy.value = false
  }
}

async function withdraw(r: ReturnRequest) {
  try {
    upsert(await authorized((t) => withdrawReturn(t, r.id)))
    show(`${r.number} withdrawn.`, 'success')
  } catch (e) {
    show((e as Error).message, 'error')
    void loadReturns()
  }
}
const photoLoader = (r: ReturnRequest) => (photoId: string) => authorized((t) => myReturnPhoto(t, r.id, photoId))
const when = (iso: string) => new Intl.DateTimeFormat('en-LK', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))
</script>

<template>
  <section v-if="requests.length || info?.eligible" class="mb-3 space-y-3" aria-label="Returns and refunds" data-testid="order-returns">
    <!-- The order's requests -->
    <article v-for="r in requests" :key="r.id" class="rounded-2xl bg-white p-4 ring-1 ring-line" :data-testid="`return-${r.number}`">
      <header class="flex flex-wrap items-center gap-2">
        <AppIcon name="refresh" :size="16" class="text-hela-green" />
        <b class="text-sm text-ink">Return {{ r.number }}</b>
        <span class="rounded-full px-2 py-0.5 text-[0.68rem] font-bold" :class="RETURN_TONE[r.status]" data-testid="return-status">{{ r.statusLabel }}</span>
        <span class="ml-auto text-xs text-muted">{{ when(r.createdAt) }}</span>
      </header>
      <ul class="mt-2.5 space-y-1 text-sm">
        <li v-for="i in r.items" :key="i.lineNumber" class="flex items-start justify-between gap-3">
          <span class="min-w-0 text-ink">
            {{ i.approvedQuantity != null && r.status !== 'requested' ? `${i.approvedQuantity} of ${i.quantity}` : i.quantity }} × {{ i.name }}
            <span class="block text-xs text-muted">{{ i.reasonLabel }}</span>
          </span>
          <span v-if="!['requested', 'withdrawn', 'replaced'].includes(r.status)" class="shrink-0 text-xs font-semibold tabular-nums text-ink">{{ formatLKR(i.refundCents) }}</span>
        </li>
      </ul>
      <p v-if="r.status === 'requested' && r.preferredResolution === 'replace'" class="mt-2 text-xs font-semibold text-[#1F4E7A]">You asked for these to be sent again.</p>
      <p v-if="r.customerNote" class="mt-2 rounded-lg bg-cream/70 px-3 py-2 text-xs text-[#3d4245]">“{{ r.customerNote }}”</p>
      <ReturnPhotos class="mt-2" :ids="r.photoIds" :load="photoLoader(r)" />

      <p v-if="r.status === 'replaced'" class="mt-3 flex items-start gap-2 rounded-xl bg-hela-green-50 px-3 py-2.5 text-sm text-hela-green" data-testid="return-replacement">
        <AppIcon name="truck" :size="16" class="mt-0.5 shrink-0" />
        <span><b>Sending the items again — no charge</b><span class="block text-xs">Replacement order {{ r.replacementOrderNumber }} is in Your orders, where you can track it.</span></span>
      </p>
      <div v-if="r.status === 'approved' || r.status === 'refunded'" class="mt-3 flex items-center justify-between rounded-xl bg-hela-green-50 px-3 py-2.5 text-sm" data-testid="return-refund">
        <span class="text-hela-green">
          <b>{{ r.status === 'refunded' ? 'Refunded' : 'Refund approved' }}</b>
          <span v-if="r.needsSupervisor" class="block text-xs">A supervisor at the store confirms it next</span>
          <span v-if="r.deliveryRefundCents" class="block text-xs">Includes the delivery fee</span>
          <span v-if="r.creditNote" class="block text-xs" data-testid="return-refund-how">{{ r.creditNote.summary }}<template v-if="r.refundedAt"> · {{ when(r.refundedAt) }}</template></span>
          <span v-else-if="r.refundMethodLabel" class="block text-xs">{{ r.refundMethodLabel }}<template v-if="r.refundReference"> · ref {{ r.refundReference }}</template><template v-if="r.refundedAt"> · {{ when(r.refundedAt) }}</template></span>
          <span v-if="r.creditNote?.method === 'original'" class="block text-[0.7rem] text-muted">Card refunds usually show on your statement within 5–10 working days.</span>
        </span>
        <b class="text-base tabular-nums text-hela-green">{{ formatLKR(r.refundCents) }}</b>
      </div>
      <button v-if="r.creditNote" type="button" class="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-hela-green hover:underline" data-testid="view-credit-note" @click="noteOf = r">
        <AppIcon name="receipt" :size="13" />Credit note {{ r.creditNote.number }}
      </button>
      <p v-if="r.decisionNote" class="mt-2 flex gap-2 text-xs" :class="r.status === 'rejected' ? 'text-[#8A2E2E]' : 'text-[#3d4245]'" data-testid="return-decision">
        <AppIcon name="info" :size="13" class="mt-px shrink-0" /><span><b>{{ r.storeName ?? 'The store' }}:</b> {{ r.decisionNote }}</span>
      </p>

      <p v-if="r.escalation" class="mt-2 flex gap-2 rounded-lg px-3 py-2 text-xs" :class="r.escalation.status === 'open' ? 'bg-[#FFF4D6] text-[#7A5600]' : 'bg-[#E3EEF9] text-[#1F4E7A]'" data-testid="return-escalation">
        <AppIcon name="shield" :size="13" class="mt-px shrink-0" />
        <span v-if="r.escalation.status === 'open'"><b>HelaMart is reviewing this request.</b> We’ll reply within 2 working days.</span>
        <span v-else><b>HelaMart’s review:</b> {{ r.escalation.status === 'overturned' ? 'refund approved — the store pays it next.' : 'the store’s decision stands.' }} {{ r.escalation.note }}</span>
      </p>

      <ol class="mt-3 space-y-1 border-l-2 border-line pl-3 text-xs text-muted">
        <li v-for="(e, k) in r.events" :key="k"><b class="text-ink">{{ e.label }}</b> · {{ when(e.at) }}</li>
      </ol>
      <div v-if="r.canEscalate" class="mt-3">
        <button v-if="reviewFor !== r.id" type="button" class="text-xs font-bold text-hela-green underline" data-testid="return-escalate" @click="reviewFor = r.id; reviewReason = ''">
          {{ r.status === 'rejected' ? 'Disagree? Ask HelaMart to review' : 'No reply yet? Ask HelaMart to help' }}
        </button>
        <form v-else class="space-y-2 rounded-xl bg-cream/70 p-3" data-testid="escalate-form" @submit.prevent="escalate(r)">
          <label class="block text-xs font-semibold text-ink">What should HelaMart know?
            <textarea v-model="reviewReason" rows="2" maxlength="500" class="field mt-1 text-sm" placeholder="e.g. The photos show the eggs were broken when they arrived." data-testid="escalate-reason" />
          </label>
          <div class="flex justify-end gap-2">
            <button type="button" class="btn-ghost h-9 text-xs" @click="reviewFor = null">Cancel</button>
            <button type="submit" class="btn-primary h-9 text-xs" :disabled="busy || reviewReason.trim().length < 10" data-testid="escalate-submit">Send to HelaMart</button>
          </div>
        </form>
      </div>
      <button v-if="r.status === 'requested'" type="button" class="mt-3 text-xs font-bold text-[#8A2E2E] underline" data-testid="return-withdraw" @click="withdraw(r)">Withdraw this request</button>
    </article>

    <CreditNoteDialog :ret="noteOf" @close="noteOf = null" />

    <!-- Report a problem -->
    <div v-if="info?.eligible && !formOpen" class="rounded-2xl bg-white p-4 ring-1 ring-line">
      <p class="font-bold text-ink">Something wrong with your order?</p>
      <p class="mt-0.5 text-xs text-muted">Damaged, spoiled, wrong or missing items — tell {{ order.storeName ?? 'the store' }} by {{ deadlineText }}<template v-if="info.windowHours !== 24"> ({{ info.windowHours % 24 === 0 && info.windowHours >= 48 ? `${info.windowHours / 24} days` : `${info.windowHours} hours` }} after receiving it)</template>.</p>
      <button type="button" class="btn-ghost mt-3 h-10 w-full" data-testid="report-problem" @click="openForm"><AppIcon name="alert" :size="16" />Report a problem</button>
    </div>

    <form v-if="formOpen && info" class="space-y-3 rounded-2xl bg-white p-4 ring-2 ring-hela-green/40" novalidate data-testid="return-form" @submit.prevent="submit">
      <div class="flex items-center justify-between">
        <p class="font-bold text-ink">Report a problem</p>
        <button type="button" class="text-xs font-semibold text-muted hover:text-ink" @click="formOpen = false">Cancel</button>
      </div>
      <p class="text-xs text-muted">Tick each item with a problem. The store reviews your request and {{ info.replacements ? 'refunds or replaces' : 'refunds' }} what it approves.</p>
      <ul class="space-y-2">
        <li v-for="l in info.lines" :key="l.lineNumber" class="rounded-xl p-3 ring-1" :class="picks[l.lineNumber]?.on ? 'bg-hela-green-50/60 ring-hela-green/30' : 'ring-line'">
          <label class="flex items-start gap-2.5" :class="l.returnableQuantity ? 'cursor-pointer' : 'opacity-50'">
            <input v-model="picks[l.lineNumber]!.on" type="checkbox" class="mt-0.5 size-4 accent-hela-green" :disabled="!l.returnableQuantity" :data-testid="`return-pick-${l.lineNumber}`">
            <span class="min-w-0 flex-1 text-sm">
              <b class="text-ink">{{ l.name }}</b> <span class="text-muted">· {{ l.size }} · bought {{ l.quantity }}</span>
              <span v-if="!l.returnableQuantity" class="block text-xs text-muted">Already in a return</span>
            </span>
          </label>
          <div v-if="picks[l.lineNumber]?.on" class="mt-2.5 grid grid-cols-[auto_1fr] items-center gap-2 pl-6">
            <span class="flex items-center rounded-lg ring-1 ring-line">
              <button type="button" class="grid size-8 place-items-center text-hela-green disabled:opacity-40" :disabled="picks[l.lineNumber]!.quantity <= 1" aria-label="Fewer" @click="picks[l.lineNumber]!.quantity--"><AppIcon name="minus" :size="14" /></button>
              <span class="w-6 text-center text-sm font-bold tabular-nums">{{ picks[l.lineNumber]!.quantity }}</span>
              <button type="button" class="grid size-8 place-items-center text-hela-green disabled:opacity-40" :disabled="picks[l.lineNumber]!.quantity >= l.returnableQuantity" aria-label="More" @click="picks[l.lineNumber]!.quantity++"><AppIcon name="plus" :size="14" /></button>
            </span>
            <select v-model="picks[l.lineNumber]!.reason" class="field h-9 text-sm" :data-testid="`return-reason-${l.lineNumber}`">
              <option value="" disabled>What’s wrong?</option>
              <option v-for="(label, code) in info.reasons" :key="code" :value="code">{{ label }}</option>
            </select>
          </div>
        </li>
      </ul>

      <div>
        <p class="mb-1.5 text-sm font-semibold text-ink">Photos <span class="font-normal text-muted">{{ needsPhoto ? '(needed for damaged, spoiled or wrong items)' : '(optional)' }}</span></p>
        <div class="flex flex-wrap gap-2">
          <span v-for="(p, k) in photos" :key="k" class="relative">
            <img :src="p" alt="" class="size-16 rounded-xl object-cover ring-1 ring-line">
            <button type="button" class="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full bg-ink text-white" aria-label="Remove photo" @click="photos = photos.filter((_, i) => i !== k)"><AppIcon name="close" :size="11" /></button>
          </span>
          <label v-if="photos.length < 4" class="grid size-16 cursor-pointer place-items-center rounded-xl border-2 border-dashed border-line bg-cream text-hela-green hover:bg-hela-green-50" aria-label="Add photos">
            <AppIcon name="plus" :size="18" />
            <input type="file" accept="image/jpeg,image/png,image/webp" multiple class="sr-only" data-testid="return-photo-input" @change="addPhotos">
          </label>
        </div>
        <p v-if="photoError" class="mt-1 text-xs text-[#8A2E2E]">{{ photoError }}</p>
      </div>

      <fieldset v-if="info.replacements">
        <legend class="mb-1.5 text-sm font-semibold text-ink">What would you like?</legend>
        <div class="grid grid-cols-2 gap-2" role="radiogroup">
          <button
            v-for="o in ([['refund', 'A refund', 'Money back for these items'], ['replace', 'Send them again', 'At no charge, with a new order']] as const)"
            :key="o[0]"
            type="button"
            role="radio"
            :aria-checked="resolution === o[0]"
            class="rounded-xl bg-white p-2.5 text-left text-sm ring-1 transition"
            :class="resolution === o[0] ? 'ring-2 ring-hela-green' : 'ring-line hover:bg-hela-green-50'"
            :data-testid="`return-resolution-${o[0]}`"
            @click="resolution = o[0]"
          ><b class="block text-ink">{{ o[1] }}</b><span class="text-xs text-muted">{{ o[2] }}</span></button>
        </div>
      </fieldset>

      <label class="block">
        <span class="mb-1.5 block text-sm font-semibold text-ink">Anything else? <span class="font-normal text-muted">(optional)</span></span>
        <textarea v-model="note" rows="2" maxlength="500" class="field text-sm" placeholder="e.g. The egg tray was crushed and 4 eggs were broken." data-testid="return-note" />
      </label>

      <p v-if="chosen.length && resolution === 'refund'" class="flex items-center justify-between rounded-xl bg-cream/70 px-3 py-2 text-sm">
        <span class="text-muted">Estimated refund <span class="block text-[0.7rem]">The store confirms the final amount.</span></span>
        <b class="tabular-nums text-ink" data-testid="return-estimate">{{ formatLKR(estimate) }}</b>
      </p>
      <p v-if="error" class="flex gap-2 rounded-xl bg-[#FBEAEA] px-3 py-2 text-sm text-[#8A2E2E]" role="alert"><AppIcon name="alert" :size="15" class="mt-0.5 shrink-0" />{{ error }}</p>
      <button type="submit" class="btn-primary h-11 w-full" :disabled="busy" data-testid="return-submit">{{ busy ? 'Sending…' : 'Send to the store' }}</button>
    </form>
  </section>
</template>
