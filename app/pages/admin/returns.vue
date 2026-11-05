<script setup lang="ts">
import type { TableColumn } from '~/types/admin'
import type { RefundMethod, Resolution, ReturnCounts, ReturnPolicy, ReturnReason, ReturnRequest, ReturnSummary, StockAction } from '~/types/returns'
import { confirmReturn, getReturnPolicy, listReturns, recordRefund, returnPhoto, returnsSummary, reviewReturn, saveReturnPolicy } from '~/services/admin/returnsApi'
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
const counts = ref<ReturnCounts>({ requested: 0, approved: 0, refunded: 0, rejected: 0, overdue: 0, replaced: 0, supervisor: 0, escalated: 0 })
const loading = ref(true)
type Tab = 'requested' | 'approved' | 'supervisor' | 'refunded' | 'replaced' | 'rejected' | 'escalated' | 'all'
const status = ref<Tab>('requested')
const summary = ref<ReturnSummary | null>(null)
const policy = ref<ReturnPolicy | null>(null)
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
    void auth.call((t) => returnsSummary(t, { days: 30, branch: branch.value })).then((x) => (summary.value = x)).catch(() => {})
    if (!policy.value) void auth.call(getReturnPolicy).then((x) => (policy.value = x)).catch(() => {})
  } catch (e) {
    notify.error(e)
  } finally {
    loading.value = false
  }
}
onMounted(load)
watch([status, branch], load)

const TABS = computed<{ id: Tab; label: string; count: number | null }[]>(() => [
  { id: 'requested', label: 'To review', count: counts.value.requested },
  { id: 'approved', label: 'Refund due', count: counts.value.approved },
  ...(counts.value.supervisor ? [{ id: 'supervisor' as const, label: 'Needs a supervisor', count: counts.value.supervisor }] : []),
  { id: 'refunded', label: 'Refunded', count: counts.value.refunded },
  { id: 'replaced', label: 'Sent again', count: counts.value.replaced },
  { id: 'rejected', label: 'Rejected', count: counts.value.rejected },
  { id: 'escalated', label: 'HelaMart reviews', count: counts.value.escalated },
  { id: 'all', label: 'All', count: null },
])
const STATUS_TEXT: Record<string, string> = { requested: 'To review', approved: 'Refund due', refunded: 'Refunded', replaced: 'Sent again', rejected: 'Rejected', withdrawn: 'Withdrawn' }
const RISK_TONE: Record<string, string> = { high: 'bg-[#FBEAEA] text-[#8A2E2E]', watch: 'bg-[#FFF4D6] text-[#7A5600]' }

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
const resolution = ref<Resolution>('refund')
const busy = ref(false)
// Reset the forms when another request is opened (or this one moves on), not on every refresh.
watch(() => `${selected.value?.id}|${selected.value?.status}`, () => {
  const r = selected.value
  if (!r) return
  reviewNote.value = ''
  resolution.value = r.preferredResolution === 'replace' && policy.value?.replacements !== false ? 'replace' : 'refund'
  for (const i of r.items) decisions[i.lineNumber] = { approved: i.approvedQuantity ?? i.quantity, stock: i.stockAction ?? (['damaged', 'spoiled'].includes(i.reason) ? 'write_off' : 'restock') }
  refund.method = (r.paidOutLeftCents ?? 0) === 0 ? 'store_credit' : r.paymentMethod === 'card' ? 'original' : 'cash'
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
        resolution: resolution.value,
        items: decision === 'approve' ? r.items.map((i) => ({ lineNumber: i.lineNumber, approvedQuantity: decisions[i.lineNumber]!.approved, stockAction: decisions[i.lineNumber]!.approved > 0 ? decisions[i.lineNumber]!.stock : null })) : undefined,
      }),
    )
    replace(updated)
    notify.ok(decision === 'reject' ? `${r.number} rejected — the customer sees your reason`
      : updated.status === 'replaced' ? `${r.number}: replacement order ${updated.replacementOrderNumber} is on the order desk`
        : updated.needsSupervisor ? `${r.number}: approved — a supervisor confirms the ${formatLKR(updated.refundCents)} refund next`
          : `${r.number}: ${formatLKR(updated.refundCents)} refund approved`)
    void load()
  } catch (e) {
    notify.error(e)
  } finally {
    busy.value = false
  }
}

// ---- refund
const refund = reactive<{ method: RefundMethod; reference: string; note: string }>({ method: 'cash', reference: '', note: '' })
const METHODS = computed(() => {
  const r = selected.value
  // Paid fully with store credit: it can only go back as store credit.
  if (!r || (r.paidOutLeftCents ?? 0) === 0) return [{ id: 'store_credit' as const, label: 'Store credit', hint: 'Added to the customer’s balance with you' }]
  return [
    ...(r.paymentMethod === 'card' ? [{ id: 'original' as const, label: 'Back to the card', hint: `Card •••• ${r.cardLast4} · via the payment gateway` }] : []),
    { id: 'store_credit' as const, label: 'Store credit', hint: 'Instant · spent on their next order' },
    { id: 'cash' as const, label: 'Cash', hint: 'At the counter or next delivery' },
    { id: 'bank_transfer' as const, label: 'Bank transfer', hint: 'Enter the transfer reference' },
  ]
})
/** How the refund will be split: card / cash / bank up to what they paid that way, the rest as store credit. */
const split = computed(() => {
  const r = selected.value
  if (!r) return { out: 0, credit: 0 }
  const out = refund.method === 'store_credit' ? 0 : Math.min(r.refundCents, r.paidOutLeftCents ?? r.refundCents)
  return { out, credit: r.refundCents - out }
})
const noteOf = ref<ReturnRequest | null>(null)
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
async function confirmIt() {
  const r = selected.value!
  busy.value = true
  try {
    replace(await auth.call((t) => confirmReturn(t, r.id)))
    notify.ok(`${r.number}: refund confirmed — it can be paid now`)
    void load()
  } catch (e) {
    notify.error(e)
  } finally {
    busy.value = false
  }
}

// ---- return policy (settings.manage)
const policyOpen = ref(false)
const draft = reactive<{ windowHours: number; reasons: ReturnReason[]; photosRequired: boolean; replacements: boolean; limitRs: string }>({ windowHours: 24, reasons: [], photosRequired: true, replacements: true, limitRs: '' })
const REASONS: Record<ReturnReason, string> = { damaged: 'Damaged or broken', spoiled: 'Spoiled or expired', wrong_item: 'Wrong item', missing: 'Missing from the order', not_as_described: 'Not as described', changed_mind: 'Changed my mind' }
const WINDOWS = [[12, '12 hours'], [24, '24 hours'], [48, '2 days'], [72, '3 days'], [168, '7 days'], [336, '14 days'], [720, '30 days']] as const
function openPolicy() {
  const p = policy.value
  if (!p) return
  Object.assign(draft, { windowHours: p.windowHours, reasons: [...p.reasons], photosRequired: p.photosRequired, replacements: p.replacements, limitRs: p.approvalLimitCents == null ? '' : String(p.approvalLimitCents / 100) })
  policyOpen.value = true
}
async function savePolicy() {
  busy.value = true
  try {
    const limit = draft.limitRs.trim() === '' ? null : Math.round(Number(draft.limitRs) * 100)
    policy.value = await auth.call((t) => saveReturnPolicy(t, { windowHours: draft.windowHours, reasons: draft.reasons, photosRequired: draft.photosRequired, replacements: draft.replacements, approvalLimitCents: limit }), 'Changing the return policy needs your password confirmed.')
    policyOpen.value = false
    notify.ok('Return policy saved — customers see it on their next report.')
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
    <AdminPageHeader title="Returns & refunds" description="Customers report damaged, wrong or missing items here. Review each request, then refund it or send the items again.">
      <button v-if="auth.can('settings.manage') && policy" type="button" class="btn-ghost h-10" data-testid="open-policy" @click="openPolicy"><AppIcon name="settings" :size="16" />Return policy</button>
      <button type="button" class="btn-ghost h-10" @click="load"><AppIcon name="refresh" :size="16" />Refresh</button>
    </AdminPageHeader>

    <section v-if="summary" class="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" aria-label="Last 30 days" data-testid="returns-summary">
      <div v-for="k in [
        ['Requests', String(summary.requests), 'last 30 days'],
        ['Approved', `${summary.approvalRate}%`, `${summary.approved} of ${summary.decided} decided`],
        ['Refunded', formatLKR(summary.refundedCents), `${summary.replacements} sent again instead`],
        ['Time to decide', summary.averageHoursToDecision == null ? '—' : `${summary.averageHoursToDecision} h`, 'on average'],
        ['Written off', String(summary.writtenOffUnits), `${formatLKR(summary.writtenOffCents)} refunded on them`],
        ['HelaMart reviews', String(summary.escalations), 'asked by customers'],
      ]" :key="k[0]" class="rounded-2xl bg-white p-3 ring-1 ring-line">
        <p class="text-[0.7rem] font-bold tracking-wide text-muted uppercase">{{ k[0] }}</p>
        <p class="mt-0.5 text-lg font-extrabold tabular-nums text-ink">{{ k[1] }}</p>
        <p class="text-[0.7rem] text-muted">{{ k[2] }}</p>
      </div>
      <p v-if="summary.topReasons.length" class="col-span-full text-xs text-muted">Most reported: <span v-for="(x, k) in summary.topReasons" :key="x.reason">{{ k ? ' · ' : '' }}<b class="text-ink">{{ x.label }}</b> {{ x.items }}</span></p>
    </section>

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
        <span v-if="row.risk && row.risk.level !== 'normal'" class="ml-1.5 rounded px-1.5 py-0.5 text-[0.65rem] font-bold uppercase" :class="RISK_TONE[row.risk.level]" :title="row.risk.reasons.join(' · ')">{{ row.risk.level === 'high' ? 'Check' : 'Watch' }}</span>
        <span v-if="overdue(row)" class="ml-1.5 rounded bg-[#FBEAEA] px-1.5 py-0.5 text-[0.65rem] font-bold text-[#8A2E2E]">OVER 24 H</span>
      </template>
      <template #cell-createdAt="{ row }"><span class="whitespace-nowrap text-muted">{{ fmt(row.createdAt) }}</span></template>
      <template #cell-orderNumber="{ row }"><span class="text-xs font-semibold text-ink">{{ row.orderNumber }}</span><span class="block text-[0.7rem] text-muted">{{ row.branchName }}</span></template>
      <template #cell-items="{ row }"><span class="text-xs text-ink">{{ row.items.map((i: any) => `${i.quantity} × ${i.name}`).join(', ') }}</span></template>
      <template #cell-refund="{ row }"><span class="font-semibold tabular-nums">{{ formatLKR(row.status === 'requested' ? (row.requestedRefundCents ?? row.refundCents) : row.refundCents) }}</span></template>
      <template #cell-status="{ row }">
        <span class="rounded-full px-2 py-0.5 text-xs font-bold" :class="RETURN_TONE[row.status]">{{ row.needsSupervisor ? 'Needs a supervisor' : STATUS_TEXT[row.status] ?? row.status }}</span>
        <span v-if="row.escalation?.status === 'open'" class="ml-1 rounded-full bg-[#E3EEF9] px-2 py-0.5 text-[0.65rem] font-bold text-[#1F4E7A]">HelaMart review</span>
      </template>
    </AdminDataTable>

    <AdminModal :open="!!selected" :title="selected ? `Return ${selected.number}` : ''" :description="selected ? `Order ${selected.orderNumber} · ${selected.branchName} branch · reported ${fmt(selected.createdAt)}` : ''" size="lg" @close="selected = null">
      <div v-if="selected" class="space-y-5" data-testid="return-detail">
        <!-- Customer and order -->
        <div class="grid gap-4 sm:grid-cols-2">
          <section class="rounded-xl bg-white p-3.5 text-sm ring-1 ring-line">
            <h3 class="mb-1 text-xs font-bold tracking-wide text-muted uppercase">Customer</h3>
            <p class="font-semibold text-ink">{{ selected.customerName }}</p>
            <p class="text-muted">{{ selected.customerPhone }} · {{ selected.customerEmail }}</p>
            <p class="mt-1 text-xs text-muted" data-testid="return-history">{{ selected.risk?.orders ?? 0 }} orders · {{ selected.customerReturnCount }} {{ selected.customerReturnCount === 1 ? 'return' : 'returns' }} with your supermarket</p>
            <div v-if="selected.risk && selected.risk.level !== 'normal'" class="mt-1.5 rounded-lg px-2.5 py-1.5 text-xs" :class="RISK_TONE[selected.risk.level]" data-testid="return-risk">
              <b>{{ selected.risk.level === 'high' ? 'Look closely before approving' : 'Worth a second look' }}</b>
              <span class="block">{{ selected.risk.reasons.join(' · ') }}</span>
            </div>
          </section>
          <section class="rounded-xl bg-white p-3.5 text-sm ring-1 ring-line">
            <h3 class="mb-1 text-xs font-bold tracking-wide text-muted uppercase">Order {{ selected.orderNumber }}</h3>
            <p class="text-ink">{{ formatLKR(selected.orderTotalCents ?? 0) }} · {{ paymentLabel({ method: selected.paymentMethod ?? 'cod', cardLast4: selected.cardLast4, storeCreditCents: selected.orderStoreCreditCents }, true) }}</p>
            <p v-if="selected.receivedAt" class="text-muted">Received {{ fmt(selected.receivedAt) }} · confirmed by {{ VIA[selected.receivedVia ?? ''] ?? selected.receivedVia }}</p>
            <p v-if="selected.orderRefundedCents" class="text-xs text-muted">Already refunded on this order: {{ formatLKR(selected.orderRefundedCents) }}</p>
          </section>
        </div>

        <p v-if="selected.escalation" class="flex gap-2 rounded-xl px-3.5 py-2.5 text-sm" :class="selected.escalation.status === 'open' ? 'bg-[#E3EEF9] text-[#1F4E7A]' : 'bg-cream text-ink'" data-testid="return-escalation">
          <AppIcon name="shield" :size="16" class="mt-0.5 shrink-0" />
          <span v-if="selected.escalation.status === 'open'"><b>The customer asked HelaMart to review this.</b> “{{ selected.escalation.reason }}”</span>
          <span v-else><b>HelaMart’s review: {{ selected.escalation.status === 'overturned' ? 'refund the customer' : 'your decision stands' }}.</b> {{ selected.escalation.note }}</span>
        </p>
        <p v-if="selected.status === 'replaced'" class="flex gap-2 rounded-xl bg-hela-green-50 px-3.5 py-2.5 text-sm text-hela-green" data-testid="return-replacement">
          <AppIcon name="truck" :size="16" class="mt-0.5 shrink-0" /><span><b>Sent again in order {{ selected.replacementOrderNumber }}</b> (no charge) — it’s on the order desk.</span>
        </p>

        <!-- What the customer says -->
        <section>
          <p v-if="selected.preferredResolution === 'replace'" class="mb-2 text-xs font-semibold text-[#1F4E7A]">The customer would like the items sent again.</p>
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
          <div v-if="policy?.replacements" class="inline-flex rounded-lg bg-white p-0.5 ring-1 ring-line" role="radiogroup" aria-label="Settle it by">
            <button
              v-for="o in ([['refund', 'Refund'], ['replace', 'Send the items again']] as const)"
              :key="o[0]"
              type="button"
              role="radio"
              :aria-checked="resolution === o[0]"
              class="h-8 rounded-md px-3 text-xs font-bold transition"
              :class="resolution === o[0] ? 'bg-hela-green text-white' : 'text-muted'"
              :data-testid="`review-resolution-${o[0]}`"
              @click="resolution = o[0]"
            >{{ o[1] }}</button>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <p class="mr-auto text-sm text-muted">{{ resolution === 'replace' ? 'A no-charge order for the approved items goes to the order desk; it comes out of this branch’s stock.' : 'The refund is worked out from what the customer paid for these items (after offers).' }}<template v-if="resolution === 'refund' && policy?.approvalLimitCents != null && !auth.can('returns.approve_large')"> Refunds over {{ formatLKR(policy.approvalLimitCents) }} need a supervisor.</template></p>
            <button type="button" class="btn-ghost h-10 text-[#8A2E2E]" :disabled="busy || !reviewNote.trim()" data-testid="review-reject" @click="review('reject')">Reject</button>
            <button type="button" class="btn-primary h-10" :disabled="busy || nothing || (partial && !reviewNote.trim())" data-testid="review-approve" @click="review('approve')">
              <AppIcon name="check" :size="15" :stroke-width="3" />{{ resolution === 'replace' ? (partial ? 'Send part again' : 'Send all again') : partial ? 'Approve part' : 'Approve all' }}
            </button>
          </div>
        </section>

        <!-- Refund -->
        <section v-if="selected.status === 'approved' || selected.status === 'refunded'" class="rounded-2xl p-4 ring-1" :class="selected.status === 'refunded' ? 'bg-hela-green-50 ring-hela-green/30' : 'bg-white ring-hela-gold'" data-testid="return-refund-box">
          <div class="flex items-center justify-between">
            <p class="font-bold text-ink">{{ selected.status === 'refunded' ? 'Refunded' : 'Refund due' }}<span v-if="selected.deliveryRefundCents" class="block text-xs font-normal text-muted">Includes the {{ formatLKR(selected.deliveryRefundCents) }} delivery fee (whole order returned)</span></p>
            <b class="text-xl tabular-nums text-hela-green" data-testid="return-refund-amount">{{ formatLKR(selected.refundCents) }}</b>
          </div>
          <template v-if="selected.status === 'refunded'">
            <p class="mt-1 text-sm text-muted" data-testid="return-refund-how">{{ selected.creditNote?.summary ?? selected.refundMethodLabel }}<template v-if="selected.refundReference"> · ref {{ selected.refundReference }}</template> · {{ selected.refundedBy }} · {{ fmt(selected.refundedAt!) }}</p>
            <button v-if="selected.creditNote" type="button" class="btn-ghost mt-2 h-9 text-sm" data-testid="view-credit-note" @click="noteOf = selected"><AppIcon name="receipt" :size="15" />Credit note {{ selected.creditNote.number }}</button>
          </template>
          <div v-else-if="selected.needsSupervisor" class="mt-3 rounded-xl bg-[#FFF4D6] p-3 text-sm text-[#7A5600]" data-testid="needs-supervisor">
            <p><b>Above your {{ formatLKR(selected.approvalLimitCents ?? 0) }} approval limit.</b> A supervisor confirms it before it can be paid.</p>
            <button v-if="selected.canApproveLarge" type="button" class="btn-primary mt-2 h-10" :disabled="busy" data-testid="confirm-large" @click="confirmIt"><AppIcon name="check" :size="15" :stroke-width="3" />Confirm {{ formatLKR(selected.refundCents) }} refund</button>
          </div>
          <template v-else-if="auth.can('orders.refund')">
            <div class="mt-3 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="How is it refunded?">
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
            <p v-if="split.credit && split.out" class="mt-2 rounded-lg bg-[#FFF4D6] px-3 py-2 text-xs text-[#7A5600]" data-testid="refund-split">
              {{ formatLKR(split.out) }} goes back {{ refund.method === 'original' ? 'to the card' : refund.method === 'cash' ? 'in cash' : 'by bank transfer' }} and {{ formatLKR(split.credit) }} as store credit — the customer paid that part with store credit.
            </p>
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
    <CreditNoteDialog :ret="noteOf" store @close="noteOf = null" />

    <AdminModal :open="policyOpen" title="Return policy" description="What customers can report, for how long, and who approves large refunds." @close="policyOpen = false">
      <form class="space-y-4" data-testid="policy-form" @submit.prevent="savePolicy">
        <label class="block">
          <span class="field-label">Customers can report a problem for</span>
          <select v-model.number="draft.windowHours" class="field" data-testid="policy-window">
            <option v-for="w in WINDOWS" :key="w[0]" :value="w[0]">{{ w[1] }} after receiving the order</option>
          </select>
          <span class="mt-1 block text-xs text-muted">HelaMart’s Terms of Order promise at least 24 hours for damaged, missing or wrong items.</span>
        </label>
        <fieldset>
          <legend class="field-label">Reasons you accept</legend>
          <div class="grid gap-1.5 sm:grid-cols-2">
            <label v-for="(label, code) in REASONS" :key="code" class="flex items-center gap-2 text-sm">
              <input v-model="draft.reasons" type="checkbox" :value="code" class="size-4 accent-hela-green" :data-testid="`policy-reason-${code}`">{{ label }}
            </label>
          </div>
        </fieldset>
        <label class="flex items-center gap-2 text-sm"><input v-model="draft.photosRequired" type="checkbox" class="size-4 accent-hela-green">Ask for photos of damaged, spoiled or wrong items</label>
        <label class="flex items-center gap-2 text-sm"><input v-model="draft.replacements" type="checkbox" class="size-4 accent-hela-green" data-testid="policy-replacements">Offer to send the items again instead of a refund</label>
        <label class="block">
          <span class="field-label">Refunds above this need a supervisor <span class="font-normal text-muted">(Rs, leave empty for no limit)</span></span>
          <input v-model="draft.limitRs" inputmode="decimal" class="field" placeholder="e.g. 5000" data-testid="policy-limit">
          <span class="mt-1 block text-xs text-muted">Supervisors are staff with “Approve large refunds”.</span>
        </label>
        <div class="flex justify-end gap-2">
          <button type="button" class="btn-ghost h-10" @click="policyOpen = false">Cancel</button>
          <button type="submit" class="btn-primary h-10" :disabled="busy || !draft.reasons.length" data-testid="policy-save"><AppIcon name="lock" :size="15" />Save policy</button>
        </div>
      </form>
    </AdminModal>
  </div>
</template>
