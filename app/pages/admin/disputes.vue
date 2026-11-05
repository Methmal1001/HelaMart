<script setup lang="ts">
import type { TableColumn } from '~/types/admin'
import type { ReturnRequest } from '~/types/returns'
import { disputePhoto, listDisputes, resolveDispute } from '~/services/admin/returnsApi'

/**
 * HelaMart head office: returns customers asked HelaMart to review (rejected, or not answered by the store).
 * Uphold the store's decision, or overturn it: every item asked for is approved and the store has to refund it.
 */
definePageMeta({ layout: 'admin', middleware: 'admin', scope: 'platform', permission: 'platform.disputes' })
useHead({ title: 'Return disputes' })

const auth = useAdminAuth()
const notify = useAdminNotify()
const list = ref<ReturnRequest[]>([])
const open = ref(0)
const loading = ref(true)
const status = ref<'open' | 'upheld' | 'overturned' | 'all'>('open')
const selected = ref<ReturnRequest | null>(null)
const note = ref('')
const busy = ref(false)

async function load() {
  loading.value = true
  try {
    const r = await auth.call((t) => listDisputes(t, status.value))
    list.value = r.returns
    open.value = r.counts.escalated
  } catch (e) {
    notify.error(e)
  } finally {
    loading.value = false
  }
}
onMounted(load)
watch(status, load)
watch(() => selected.value?.id, () => (note.value = ''))

const columns: TableColumn[] = [
  { key: 'number', label: 'Return', sortable: true },
  { key: 'storeName', label: 'Supermarket', sortable: true },
  { key: 'customerName', label: 'Customer', sortable: true },
  { key: 'escalated', label: 'Asked', sortable: true, value: (r: ReturnRequest) => r.escalation?.at ?? '' },
  { key: 'status', label: 'Store’s decision', sortable: true },
  { key: 'amount', label: 'Asked for', align: 'right', value: (r: ReturnRequest) => r.requestedRefundCents ?? 0 },
]
const fmt = (iso: string) => new Date(iso).toLocaleString('en-LK', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
const DECISION: Record<string, string> = { requested: 'No reply', rejected: 'Rejected', approved: 'Approved', refunded: 'Refunded', replaced: 'Sent again' }

async function decide(decision: 'uphold' | 'overturn') {
  const r = selected.value!
  busy.value = true
  try {
    const updated = await auth.call((t) => resolveDispute(t, r.id, { decision, note: note.value }))
    selected.value = updated
    notify.ok(decision === 'overturn' ? `${r.number}: ${formatLKR(updated.refundCents)} approved — ${r.storeName} pays it next` : `${r.number}: the store’s decision stands`)
    void load()
  } catch (e) {
    notify.error(e)
  } finally {
    busy.value = false
  }
}
const photoLoader = (r: ReturnRequest) => (photoId: string) => auth.call((t) => disputePhoto(t, r.id, photoId))
</script>

<template>
  <div>
    <AdminPageHeader title="Return disputes" description="Customers who disagree with a supermarket’s decision, or got no reply within 48 hours, ask HelaMart to review. Reply within 2 working days.">
      <button type="button" class="btn-ghost h-10" @click="load"><AppIcon name="refresh" :size="16" />Refresh</button>
    </AdminPageHeader>

    <div class="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Disputes">
      <button
        v-for="t in ([['open', 'Open'], ['overturned', 'Refund approved'], ['upheld', 'Store’s decision stands'], ['all', 'All']] as const)"
        :key="t[0]"
        type="button"
        role="tab"
        :aria-selected="status === t[0]"
        class="inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm font-semibold ring-1 transition"
        :class="status === t[0] ? 'bg-hela-green text-white ring-hela-green' : 'bg-white text-ink ring-line hover:bg-hela-green-50'"
        :data-testid="`disputes-tab-${t[0]}`"
        @click="status = t[0]"
      >{{ t[1] }}<span v-if="t[0] === 'open'" class="rounded-full px-1.5 text-xs" :class="status === 'open' ? 'bg-white/20' : 'bg-hela-green-50 text-hela-green'">{{ open }}</span></button>
    </div>

    <AdminDataTable :rows="list" :columns="columns" row-key="id" :loading="loading" clickable search-placeholder="Search return, supermarket or customer…" empty-text="No reviews here." @row-click="selected = $event">
      <template #cell-number="{ row }"><span class="font-semibold text-ink">{{ row.number }}</span><span class="block text-[0.7rem] text-muted">{{ row.orderNumber }}</span></template>
      <template #cell-storeName="{ row }"><span class="text-ink">{{ row.storeName }}</span><span class="block text-[0.7rem] text-muted">{{ row.branchName }}</span></template>
      <template #cell-escalated="{ row }"><span class="whitespace-nowrap text-muted">{{ row.escalation ? fmt(row.escalation.at) : '' }}</span></template>
      <template #cell-status="{ row }">
        <span class="text-xs font-bold text-ink">{{ DECISION[row.status] ?? row.status }}</span>
        <span v-if="row.escalation?.status !== 'open'" class="ml-1 rounded-full px-2 py-0.5 text-[0.65rem] font-bold" :class="row.escalation?.status === 'overturned' ? 'bg-hela-green-50 text-hela-green' : 'bg-cream text-ink'">{{ row.escalation?.status === 'overturned' ? 'Overturned' : 'Upheld' }}</span>
      </template>
      <template #cell-amount="{ row }"><span class="font-semibold tabular-nums">{{ formatLKR(row.requestedRefundCents ?? 0) }}</span></template>
    </AdminDataTable>

    <AdminModal :open="!!selected" :title="selected ? `Review ${selected.number}` : ''" :description="selected ? `${selected.storeName} · ${selected.branchName} · order ${selected.orderNumber}` : ''" size="lg" @close="selected = null">
      <div v-if="selected" class="space-y-4" data-testid="dispute-detail">
        <section class="rounded-xl bg-[#E3EEF9] p-3.5 text-sm text-[#1F4E7A]">
          <p class="font-bold">{{ selected.customerName }} says:</p>
          <p class="mt-0.5">“{{ selected.escalation?.reason }}”</p>
          <p class="mt-1 text-xs">{{ selected.customerEmail }} · {{ selected.customerPhone }} · {{ selected.customerReturnCount }} returns on HelaMart</p>
        </section>
        <section class="grid gap-3 sm:grid-cols-2">
          <div class="rounded-xl bg-white p-3.5 text-sm ring-1 ring-line">
            <h3 class="mb-1 text-xs font-bold tracking-wide text-muted uppercase">Reported</h3>
            <ul class="space-y-1">
              <li v-for="i in selected.items" :key="i.lineNumber"><b class="text-ink">{{ i.quantity }} × {{ i.name }}</b> <span class="text-xs text-[#8a3d00]">· {{ i.reasonLabel }}</span></li>
            </ul>
            <p v-if="selected.customerNote" class="mt-2 text-xs text-muted">“{{ selected.customerNote }}”</p>
          </div>
          <div class="rounded-xl bg-white p-3.5 text-sm ring-1 ring-line">
            <h3 class="mb-1 text-xs font-bold tracking-wide text-muted uppercase">The store</h3>
            <p class="text-ink"><b>{{ DECISION[selected.status] ?? selected.status }}</b><template v-if="selected.reviewedAt"> · {{ fmt(selected.reviewedAt) }}</template></p>
            <p v-if="selected.decisionNote" class="mt-1 text-xs text-muted">“{{ selected.decisionNote }}”</p>
            <p class="mt-1 text-xs text-muted">Order {{ formatLKR(selected.orderTotalCents ?? 0) }}<template v-if="selected.receivedAt"> · received {{ fmt(selected.receivedAt) }}</template></p>
          </div>
        </section>
        <ReturnPhotos :ids="selected.photoIds" :load="photoLoader(selected)" />

        <section v-if="selected.escalation?.status === 'open'" class="space-y-3 rounded-2xl bg-hela-green-50/60 p-4 ring-1 ring-hela-green/20" data-testid="dispute-decide">
          <label class="block">
            <span class="field-label">Decision, shown to the customer and the store</span>
            <textarea v-model="note" rows="3" maxlength="500" class="field" placeholder="e.g. The photos clearly show broken eggs on arrival, so the refund is approved." data-testid="dispute-note" />
          </label>
          <div class="flex flex-wrap justify-end gap-2">
            <button type="button" class="btn-ghost h-10" :disabled="busy || note.trim().length < 5" data-testid="dispute-uphold" @click="decide('uphold')">Store’s decision stands</button>
            <button type="button" class="btn-primary h-10" :disabled="busy || note.trim().length < 5" data-testid="dispute-overturn" @click="decide('overturn')">
              <AppIcon name="check" :size="15" :stroke-width="3" />Approve {{ formatLKR(selected.requestedRefundCents ?? 0) }} refund
            </button>
          </div>
          <p class="text-xs text-muted">Approving puts the refund in the store’s “Refund due”; they pay it from their portal.</p>
        </section>
        <p v-else-if="selected.escalation" class="rounded-xl bg-cream p-3.5 text-sm"><b>{{ selected.escalation.status === 'overturned' ? `Refund approved (${formatLKR(selected.refundCents)})` : 'The store’s decision stands' }}</b> · {{ selected.escalation.resolvedBy }}<template v-if="selected.escalation.resolvedAt"> · {{ fmt(selected.escalation.resolvedAt) }}</template><span class="block text-muted">{{ selected.escalation.note }}</span></p>

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
