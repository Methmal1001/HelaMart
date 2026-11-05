<script setup lang="ts">
import type { TableColumn } from '~/types/admin'
import type { RefundMethod, ReturnCounts, ReturnRequest, StockAction } from '~/types/returns'
import { listReturns, recordRefund, returnPhoto, reviewReturn } from '~/services/admin/returnsApi'
import { branchDirectory } from '~/services/admin/orderingApi'
import { RETURN_TONE } from '~/composables/useMyReturns'

/**
 * Returns & refunds: customers' reports of problems with delivered / collected orders. Review each (approve all or
 * part, or reject), decide what happens to the items, then record the refund.
 */
definePageMeta({ layout: 'admin', middleware: 'admin', scope: 'tenant', permission: 'orders.view' })
useHead({ title: 'Returns & refunds' })

const auth = useAdminAuth()
const notify = useAdminNotify()

const list = ref<ReturnRequest[]>([])
const counts = ref<ReturnCounts>({ requested: 0, approved: 0, refunded: 0, rejected: 0, overdue: 0 })
const loading = ref(true)
const status = ref<'requested' | 'approved' | 'refunded' | 'rejected' | 'all'>('requested')
const branches = ref<{ id: string; name: string }[]>([])
const branch = ref('all')
/** The open request (kept even when a reload moves it to another tab). */
const selected = ref<ReturnRequest | null>(null)

async function load() {
  loading.value = true
  try {
    const [r, b] = await Promise.all([auth.call((t) => listReturns(t, { status: status.value, branch: branch.value })), branches.value.length ? Promise.resolve(branches.value) : auth.call(branchDirectory)])
    list.value = r.returns
    counts.value = r.counts
    branches.value = b
  } catch (e) {
    notify.error(e)
  } finally {
    loading.value = false
  }
}
onMounted(load)
watch([status, branch], load)

const TABS = computed(() => [
  { id: 'requested' as const, label: 'To review', count: counts.value.requested },
  { id: 'approved' as const, label: 'Refund due', count: counts.value.approved },
  { id: 'refunded' as const, label: 'Refunded', count: counts.value.refunded },
  { id: 'rejected' as const, label: 'Rejected', count: counts.value.rejected },
  { id: 'all' as const, label: 'All', count: null },
])

const columns: TableColumn[] = [
  { key: 'number', label: 'Return', sortable: true },
  { key: 'createdAt', label: 'Reported', sortable: true },
  { key: 'orderNumber', label: 'Order', sortable: true },
  { key: 'customerName', label: 'Customer', sortable: true },
  { key: 'items', label: 'Items', value: (r: ReturnRequest) => r.items.length },
  { key: 'refund', label: 'Refund', align: 'right', sortable: true, value: (r: ReturnRequest) => r.refundCents },
  { key: 'status', label: 'Status', sortable: true },
]
const overdue = (r: ReturnRequest) => r.status === 'requested' && Date.now() - new Date(r.createdAt).getTime() > 24 * 3600e3
const fmt = (iso: string) => new Date(iso).toLocaleString('en-LK', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
const VIA: Record<string, string> = { customer_qr: 'QR scan', customer_app: 'the customer', staff: 'staff' }

// ---- review
const decisions = reactive<Record<number, { approved: number; stock: StockAction }>>({})
const reviewNote = ref('')
const busy = ref(false)
// Reset the forms when another request is opened (or this one moves on), not on every refresh.
watch(() => `${selected.value?.id}|${selected.value?.status}`, () => {
  const r = selected.value
  if (!r) return
  reviewNote.value = ''
  for (const i of r.items) decisions[i.lineNumber] = { approved: i.approvedQuantity ?? i.quantity, stock: i.stockAction ?? (['damaged', 'spoiled'].includes(i.reason) ? 'write_off' : 'restock') }
  refund.method = r.paymentMethod === 'card' ? 'original' : 'cash'
  refund.reference = ''
  refund.note = ''
})
const partial = computed(() => !!selected.value?.items.some((i) => (decisions[i.lineNumber]?.approved ?? 0) < i.quantity))
const nothing = computed(() => !!selected.value?.items.every((i) => (decisions[i.lineNumber]?.approved ?? 0) === 0))

function replace(r: ReturnRequest) {
  list.value = list.value.map((x) => (x.id === r.id ? r : x))
  if (selected.value?.id === r.id) selected.value = r
}

async function review(decision: 'approve' | 'reject') {
  const r = selected.value!
  busy.value = true
  try {
    const updated = await auth.call((t) =>
      reviewReturn(t, r.id, {
        decision,
        note: reviewNote.value,
        items: decision === 'approve' ? r.items.map((i) => ({ lineNumber: i.lineNumber, approvedQuantity: decisions[i.lineNumber]!.approved, stockAction: decisions[i.lineNumber]!.approved > 0 ? decisions[i.lineNumber]!.stock : null })) : undefined,
      }),
    )
    replace(updated)
    notify.ok(decision === 'approve' ? `${r.number}: ${formatLKR(updated.refundCents)} refund approved` : `${r.number} rejected — the customer sees your reason`)
    void load()
  } catch (e) {
    notify.error(e)
  } finally {
    busy.value = false
  }
}

// ---- refund
const refund = reactive<{ method: RefundMethod; reference: string; note: string }>({ method: 'cash', reference: '', note: '' })
const METHODS = computed(() => [
  ...(selected.value?.paymentMethod === 'card' ? [{ id: 'original' as const, label: 'Back to the card', hint: 'The card used for the order' }] : []),
  { id: 'cash' as const, label: 'Cash', hint: 'At the counter or next delivery' },
  { id: 'bank_transfer' as const, label: 'Bank transfer', hint: 'Enter the transfer reference' },
])
async function recordIt() {
  const r = selected.value!
  busy.value = true
  try {
    const updated = await auth.call((t) => recordRefund(t, r.id, { ...refund }), 'Refunds need your password confirmed.')
    replace(updated)
    notify.ok(`${r.number}: ${formatLKR(updated.refundCents)} refunded`)
    void load()
  } catch (e) {
    notify.error(e)
  } finally {
    busy.value = false
  }
}
const photoLoader = (r: ReturnRequest) => (photoId: string) => auth.call((t) => returnPhoto(t, r.id, photoId))
</script>

<template>
  <div>
    <AdminPageHeader title="Returns & refunds" description="Customers report damaged, wrong or missing items here. Review each request, then record the refund.">
      <button type="button" class="btn-ghost h-10" @click="load"><AppIcon name="refresh" :size="16" />Refresh</button>
    </AdminPageHeader>

    <div class="mb-4 flex flex-wrap items-center gap-2" role="tablist" aria-label="Returns">
      <button
        v-for="t in TABS"
        :key="t.id"
        type="button"
        role="tab"
        :aria-selected="status === t.id"
        class="inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm font-semibold ring-1 transition"
        :class="status === t.id ? 'bg-hela-green text-white ring-hela-green' : 'bg-white text-ink ring-line hover:bg-hela-green-50'"
        :data-testid="`returns-tab-${t.id}`"
        @click="status = t.id"
      >
        {{ t.label }}<span v-if="t.count !== null" class="rounded-full px-1.5 text-xs" :class="status === t.id ? 'bg-white/20' : 'bg-hela-green-50 text-hela-green'">{{ t.count }}</span>
      </button>
      <span v-if="counts.overdue" class="ml-1 rounded-full bg-[#FBEAEA] px-3 py-1 text-xs font-bold text-[#8A2E2E]" data-testid="returns-overdue"><AppIcon name="alert" :size="12" class="inline" /> {{ counts.overdue }} waiting over 24 h</span>
    </div>

    <AdminDataTable :rows="list" :columns="columns" row-key="id" :loading="loading" clickable search-placeholder="Search return, order or customer…" :initial-sort="{ key: 'createdAt', dir: 'desc' }" empty-text="No returns in this view." @row-click="selected = $event">
      <template #toolbar>
        <select v-if="branches.length > 1" v-model="branch" class="field w-auto" aria-label="Branch">
          <option value="all">All branches</option>
          <option v-for="b in branches" :key="b.id" :value="b.id">{{ b.name }}</option>
        </select>
      </template>
      <template #cell-number="{ row }">
        <span class="font-semibold text-ink">{{ row.number }}</span>
        <span v-if="overdue(row)" class="ml-1.5 rounded bg-[#FBEAEA] px-1.5 py-0.5 text-[0.65rem] font-bold text-[#8A2E2E]">OVER 24 H</span>
      </template>
      <template #cell-createdAt="{ row }"><span class="whitespace-nowrap text-muted">{{ fmt(row.createdAt) }}</span></template>
      <template #cell-orderNumber="{ row }"><span class="text-xs font-semibold text-ink">{{ row.orderNumber }}</span><span class="block text-[0.7rem] text-muted">{{ row.branchName }}</span></template>
      <template #cell-items="{ row }"><span class="text-xs text-ink">{{ row.items.map((i: any) => `${i.quantity} × ${i.name}`).join(', ') }}</span></template>
      <template #cell-refund="{ row }"><span class="font-semibold tabular-nums">{{ formatLKR(row.status === 'requested' ? (row.requestedRefundCents ?? row.refundCents) : row.refundCents) }}</span></template>
      <template #cell-status="{ row }"><span class="rounded-full px-2 py-0.5 text-xs font-bold" :class="RETURN_TONE[row.status]">{{ row.status === 'approved' ? 'Refund due' : row.status === 'requested' ? 'To review' : row.status.charAt(0).toUpperCase() + row.status.slice(1) }}</span></template>
    </AdminDataTable>

    <AdminModal :open="!!selected" :title="selected ? `Return ${selected.number}` : ''" :description="selected ? `Order ${selected.orderNumber} · ${selected.branchName} branch · reported ${fmt(selected.createdAt)}` : ''" size="lg" @close="selected = null">
      <div v-if="selected" class="space-y-5" data-testid="return-detail">
        <!-- Customer and order -->
        <div class="grid gap-4 sm:grid-cols-2">
          <section class="rounded-xl bg-white p-3.5 text-sm ring-1 ring-line">
            <h3 class="mb-1 text-xs font-bold tracking-wide text-muted uppercase">Customer</h3>
            <p class="font-semibold text-ink">{{ selected.customerName }}</p>
            <p class="text-muted">{{ selected.customerPhone }} · {{ selected.customerEmail }}</p>
            <p v-if="(selected.customerReturnCount ?? 0) > 1" class="mt-1 text-xs font-semibold text-[#8a3d00]" data-testid="return-history"><AppIcon name="history" :size="12" class="inline" /> {{ selected.customerReturnCount }} returns with your supermarket</p>
          </section>
          <section class="rounded-xl bg-white p-3.5 text-sm ring-1 ring-line">
            <h3 class="mb-1 text-xs font-bold tracking-wide text-muted uppercase">Order {{ selected.orderNumber }}</h3>
            <p class="text-ink">{{ formatLKR(selected.orderTotalCents ?? 0) }} · {{ selected.paymentMethod === 'card' ? 'Card' : 'Cash on delivery' }}</p>
            <p v-if="selected.receivedAt" class="text-muted">Received {{ fmt(selected.receivedAt) }} · confirmed by {{ VIA[selected.receivedVia ?? ''] ?? selected.receivedVia }}</p>
            <p v-if="selected.orderRefundedCents" class="text-xs text-muted">Already refunded on this order: {{ formatLKR(selected.orderRefundedCents) }}</p>
          </section>
        </div>

        <!-- What the customer says -->
        <section>
          <h3 class="mb-2 text-xs font-bold tracking-wide text-muted uppercase">Reported problem</h3>
          <p v-if="selected.customerNote" class="mb-2 rounded-xl bg-cream/70 px-3.5 py-2.5 text-sm text-ink">“{{ selected.customerNote }}”</p>
          <ReturnPhotos :ids="selected.photoIds" :load="photoLoader(selected)" />
          <p v-if="!selected.photoIds.length" class="text-xs text-muted">No photos.</p>
        </section>

        <!-- Items: decide per item while it's waiting -->
        <section>
          <h3 class="mb-2 text-xs font-bold tracking-wide text-muted uppercase">Items</h3>
          <ul class="space-y-2">
            <li v-for="i in selected.items" :key="i.lineNumber" class="rounded-xl bg-white p-3.5 ring-1 ring-line" :data-testid="`return-item-${i.lineNumber}`">
              <div class="flex flex-wrap items-start justify-between gap-2">
                <p class="text-sm"><b class="text-ink">{{ i.quantity }} × {{ i.name }}</b> <span class="text-muted">· {{ i.size }}</span><span class="block text-xs font-semibold text-[#8a3d00]">{{ i.reasonLabel }}</span></p>
                <p v-if="selected.status !== 'requested'" class="text-right text-sm">
                  <span class="text-ink">{{ i.approvedQuantity ?? 0 }} approved</span>
                  <span class="block text-xs text-muted">{{ i.stockAction === 'restock' ? 'Back on sale' : i.stockAction === 'write_off' ? 'Written off' : '—' }} · {{ formatLKR(i.refundCents) }}</span>
                </p>
              </div>
              <div v-if="selected.status === 'requested' && auth.can('orders.manage')" class="mt-2.5 flex flex-wrap items-center gap-3 text-sm">
                <label class="flex items-center gap-2">Approve
                  <select v-model.number="decisions[i.lineNumber]!.approved" class="field h-9 w-20" :data-testid="`approve-qty-${i.lineNumber}`">
                    <option v-for="n in i.quantity + 1" :key="n" :value="n - 1">{{ n - 1 }}</option>
                  </select>
                  of {{ i.quantity }}
                </label>
                <span v-if="decisions[i.lineNumber]!.approved > 0" class="inline-flex rounded-lg bg-hela-green-50 p-0.5" role="radiogroup" :aria-label="`What happens to ${i.name}`">
                  <button
                    v-for="a in ([['restock', 'Back on sale'], ['write_off', 'Write off']] as const)"
                    :key="a[0]"
                    type="button"
                    role="radio"
                    :aria-checked="decisions[i.lineNumber]!.stock === a[0]"
                    class="h-8 rounded-md px-3 text-xs font-bold transition"
                    :class="decisions[i.lineNumber]!.stock === a[0] ? 'bg-white text-hela-green shadow-card' : 'text-muted'"
                    :data-testid="`stock-${a[0]}-${i.lineNumber}`"
                    @click="decisions[i.lineNumber]!.stock = a[0]"
                  >{{ a[1] }}</button>
                </span>
              </div>
            </li>
          </ul>
        </section>

        <!-- Decision -->
        <section v-if="selected.status === 'requested' && auth.can('orders.manage')" class="space-y-3 rounded-2xl bg-hela-green-50/60 p-4 ring-1 ring-hela-green/20" data-testid="return-review">
          <label class="block">
            <span class="field-label">Message to the customer <span class="font-normal text-muted">{{ partial || nothing ? '(needed to reject or approve part)' : '(optional)' }}</span></span>
            <textarea v-model="reviewNote" rows="2" maxlength="500" class="field" placeholder="e.g. Sorry about the eggs — we’ve refunded the broken ones." data-testid="review-note" />
          </label>
          <div class="flex flex-wrap items-center gap-2">
            <p class="mr-auto text-sm text-muted">The refund is worked out from what the customer paid for these items (after offers).</p>
            <button type="button" class="btn-ghost h-10 text-[#8A2E2E]" :disabled="busy || !reviewNote.trim()" data-testid="review-reject" @click="review('reject')">Reject</button>
            <button type="button" class="btn-primary h-10" :disabled="busy || nothing || (partial && !reviewNote.trim())" data-testid="review-approve" @click="review('approve')">
              <AppIcon name="check" :size="15" :stroke-width="3" />{{ partial ? 'Approve part' : 'Approve all' }}
            </button>
          </div>
        </section>

        <!-- Refund -->
        <section v-if="selected.status === 'approved' || selected.status === 'refunded'" class="rounded-2xl p-4 ring-1" :class="selected.status === 'refunded' ? 'bg-hela-green-50 ring-hela-green/30' : 'bg-white ring-hela-gold'" data-testid="return-refund-box">
          <div class="flex items-center justify-between">
            <p class="font-bold text-ink">{{ selected.status === 'refunded' ? 'Refunded' : 'Refund due' }}<span v-if="selected.deliveryRefundCents" class="block text-xs font-normal text-muted">Includes the {{ formatLKR(selected.deliveryRefundCents) }} delivery fee (whole order returned)</span></p>
            <b class="text-xl tabular-nums text-hela-green" data-testid="return-refund-amount">{{ formatLKR(selected.refundCents) }}</b>
          </div>
          <p v-if="selected.status === 'refunded'" class="mt-1 text-sm text-muted">{{ selected.refundMethodLabel }}<template v-if="selected.refundReference"> · ref {{ selected.refundReference }}</template> · {{ selected.refundedBy }} · {{ fmt(selected.refundedAt!) }}</p>
          <template v-else-if="auth.can('orders.refund')">
            <div class="mt-3 grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="How is it refunded?">
              <button
                v-for="m in METHODS"
                :key="m.id"
                type="button"
                role="radio"
                :aria-checked="refund.method === m.id"
                class="rounded-xl bg-white p-2.5 text-left text-sm ring-1 transition"
                :class="refund.method === m.id ? 'ring-2 ring-hela-green' : 'ring-line hover:bg-hela-green-50'"
                :data-testid="`refund-method-${m.id}`"
                @click="refund.method = m.id"
              ><b class="block text-ink">{{ m.label }}</b><span class="text-xs text-muted">{{ m.hint }}</span></button>
            </div>
            <div class="mt-3 grid gap-2 sm:grid-cols-2">
              <input v-model="refund.reference" class="field h-10" maxlength="80" :placeholder="refund.method === 'bank_transfer' ? 'Transfer reference (required)' : 'Reference (optional)'" data-testid="refund-reference">
              <input v-model="refund.note" class="field h-10" maxlength="300" placeholder="Note (optional)">
            </div>
            <button type="button" class="btn-primary mt-3 h-11 w-full" :disabled="busy || (refund.method === 'bank_transfer' && !refund.reference.trim())" data-testid="record-refund" @click="recordIt">
              <AppIcon name="lock" :size="15" />Record {{ formatLKR(selected.refundCents) }} refund
            </button>
            <p class="mt-1.5 text-center text-xs text-muted">You’ll be asked to confirm your password.</p>
          </template>
          <p v-else class="mt-2 text-xs text-muted">Someone with “Issue refunds” permission records the refund.</p>
        </section>

        <p v-if="selected.decisionNote" class="text-sm"><b class="text-ink">Message to the customer:</b> <span class="text-muted">{{ selected.decisionNote }}</span></p>

        <!-- Timeline -->
        <section>
          <h3 class="mb-2 text-xs font-bold tracking-wide text-muted uppercase">History</h3>
          <ol class="space-y-1 border-l-2 border-line pl-4 text-sm">
            <li v-for="(e, k) in selected.events" :key="k"><span class="text-ink">{{ e.label }}</span><span v-if="e.note" class="text-muted"> · {{ e.note }}</span> <span class="text-xs text-muted">· {{ e.by }} · {{ fmt(e.at) }}</span></li>
          </ol>
        </section>
      </div>
    </AdminModal>
  </div>
</template>
