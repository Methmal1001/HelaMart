<script setup lang="ts">
import type { AdminOrder, OrderStatus, TableColumn } from '~/types/admin'
import { allowedTransitions, branchDirectory, listOrders, updateOrderStatus } from '~/services/admin/tenantApi'

definePageMeta({ layout: 'admin', middleware: 'admin', scope: 'tenant', permission: 'orders.view' })
useHead({ title: 'Orders' })

const auth = useAdminAuth()
const notify = useAdminNotify()
const { confirm } = useAdminConfirm()

const orders = ref<AdminOrder[]>([])
const loading = ref(true)
const filter = ref<'all' | 'open' | OrderStatus>('open')
const selected = ref<AdminOrder | null>(null)
const busy = ref(false)

const branches = ref<{ id: string; name: string }[]>([])
const branch = ref('all')
const branchName = (id: string) => branches.value.find((b) => b.id === id)?.name ?? '—'

async function load() {
  loading.value = true
  try {
    ;[orders.value, branches.value] = await Promise.all([auth.call(listOrders), auth.call(branchDirectory)])
  } catch (e) {
    notify.error(e)
  } finally {
    loading.value = false
  }
}
onMounted(load)

const OPEN: OrderStatus[] = ['pending', 'packing', 'out_for_delivery', 'ready_for_pickup']
const rows = computed(() =>
  orders.value.filter(
    (o) =>
      (branch.value === 'all' || o.branchId === branch.value) &&
      (filter.value === 'all' ? true : filter.value === 'open' ? OPEN.includes(o.status) : o.status === filter.value),
  ),
)
const counts = computed(() => ({
  open: orders.value.filter((o) => OPEN.includes(o.status)).length,
  pending: orders.value.filter((o) => o.status === 'pending').length,
}))

const columns: TableColumn[] = [
  { key: 'number', label: 'Order', sortable: true },
  { key: 'createdAt', label: 'Placed', sortable: true },
  { key: 'branchId', label: 'Branch', sortable: true, value: (o: AdminOrder) => branchName(o.branchId) },
  { key: 'customerName', label: 'Customer', sortable: true },
  { key: 'items', label: 'Items', align: 'right', value: (o: AdminOrder) => o.breakdown.itemCount },
  { key: 'total', label: 'Total', align: 'right', sortable: true, value: (o: AdminOrder) => o.breakdown.totalCents },
  { key: 'payment', label: 'Payment', value: (o: AdminOrder) => o.payment.method },
  { key: 'status', label: 'Status', sortable: true },
]

const LABEL: Record<OrderStatus, string> = {
  pending: 'Pending',
  packing: 'Start packing',
  out_for_delivery: 'Send out for delivery',
  ready_for_pickup: 'Ready for pickup',
  delivered: 'Mark delivered',
  cancelled: 'Cancel order',
  refunded: 'Refund',
}

function actionsFor(o: AdminOrder) {
  if (auth.readOnly.value) return []
  return allowedTransitions(o).filter((s) => (s === 'refunded' ? auth.can('orders.refund') : auth.can('orders.manage')))
}

async function move(o: AdminOrder, status: OrderStatus) {
  let note = ''
  if (status === 'cancelled' || status === 'refunded') {
    const r = await confirm({
      title: status === 'cancelled' ? `Cancel ${o.number}?` : `Refund ${o.number}?`,
      message:
        status === 'cancelled'
          ? 'Items go back into stock and any card payment is refunded. The customer will be notified.'
          : `Refund ${formatLKR(o.breakdown.totalCents)} to the customer. This cannot be undone.`,
      confirmLabel: status === 'cancelled' ? 'Cancel order' : 'Issue refund',
      tone: 'danger',
      reasonLabel: 'Reason',
    })
    if (!r.ok) return
    note = r.reason
  }
  busy.value = true
  try {
    const updated = await auth.call((t) => updateOrderStatus(t, o.id, status, note), 'Refunds need your password confirmed.')
    orders.value = orders.value.map((x) => (x.id === updated.id ? updated : x))
    selected.value = updated
    notify.ok(`${updated.number}: ${updated.status.replace(/_/g, ' ')}`)
  } catch (e) {
    notify.error(e)
  } finally {
    busy.value = false
  }
}

const fmt = (iso: string) => new Date(iso).toLocaleString('en-LK', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
</script>

<template>
  <div>
    <AdminPageHeader title="Orders" description="Process orders from packing to delivery. Storefront orders appear here automatically.">
      <button type="button" class="btn-ghost h-10" @click="load"><AppIcon name="refresh" :size="16" />Refresh</button>
    </AdminPageHeader>

    <AdminDataTable :rows="rows" :columns="columns" row-key="id" :loading="loading" clickable search-placeholder="Search order number or customer…" :initial-sort="{ key: 'createdAt', dir: 'desc' }" empty-text="No orders in this view." @row-click="selected = $event">
      <template #toolbar>
        <select v-if="branches.length > 1" v-model="branch" class="field w-auto" aria-label="Branch">
          <option value="all">All branches</option>
          <option v-for="b in branches" :key="b.id" :value="b.id">{{ b.name }}</option>
        </select>
        <label class="sr-only" for="order-filter">Filter</label>
        <select id="order-filter" v-model="filter" class="field w-auto">
          <option value="open">Open ({{ counts.open }})</option>
          <option value="pending">Pending ({{ counts.pending }})</option>
          <option value="packing">Packing</option>
          <option value="out_for_delivery">Out for delivery</option>
          <option value="ready_for_pickup">Ready for pickup</option>
          <option value="delivered">Delivered</option>
          <option value="cancelled">Cancelled</option>
          <option value="refunded">Refunded</option>
          <option value="all">All orders</option>
        </select>
      </template>
      <template #cell-number="{ row }">
        <span class="font-semibold text-ink">{{ row.number }}</span>
        <span v-if="row.source === 'storefront'" class="ml-1.5 rounded bg-hela-gold-100 px-1.5 py-0.5 text-[0.65rem] font-bold text-hela-gold-600">LIVE</span>
      </template>
      <template #cell-branchId="{ row }"><span class="text-xs font-semibold text-ink">{{ branchName(row.branchId) }}</span></template>
      <template #cell-createdAt="{ row }"><span class="whitespace-nowrap text-muted">{{ fmt(row.createdAt) }}</span></template>
      <template #cell-items="{ row }"><span class="tabular-nums">{{ row.breakdown.itemCount }}</span></template>
      <template #cell-total="{ row }"><span class="font-semibold tabular-nums">{{ formatLKR(row.breakdown.totalCents) }}</span></template>
      <template #cell-payment="{ row }"><span class="text-xs text-muted">{{ row.payment.method === 'card' ? `Card •${row.payment.cardLast4}` : 'Cash on delivery' }}</span></template>
      <template #cell-status="{ row }"><AdminBadge :value="row.status" /></template>
    </AdminDataTable>

    <AdminModal :open="!!selected" :title="selected ? `Order ${selected.number}` : ''" :description="selected ? `${branchName(selected.branchId)} branch · placed ${fmt(selected.createdAt)}` : ''" size="lg" @close="selected = null">
      <div v-if="selected" class="grid gap-4 md:grid-cols-2">
        <section class="space-y-1 text-sm">
          <h3 class="mb-1 text-xs font-bold tracking-wide text-muted uppercase">Customer</h3>
          <p class="font-semibold text-ink">{{ selected.customerName }}</p>
          <p class="text-muted">{{ selected.customerEmail }}</p>
          <p class="text-muted">{{ selected.delivery.phone }}</p>
        </section>
        <section class="space-y-1 text-sm">
          <h3 class="mb-1 text-xs font-bold tracking-wide text-muted uppercase">{{ selected.delivery.method === 'delivery' ? 'Delivery' : 'Store pickup' }}</h3>
          <p v-if="selected.delivery.method === 'delivery'" class="text-ink">{{ selected.delivery.address }}, {{ selected.delivery.city }}</p>
          <p class="text-muted">{{ selected.delivery.slot }}</p>
          <p v-if="selected.delivery.notes" class="text-muted">Note: {{ selected.delivery.notes }}</p>
          <p class="text-muted">Payment: {{ selected.payment.method === 'card' ? `Card •${selected.payment.cardLast4}` : 'Cash on delivery' }} · <b class="text-ink">{{ selected.payment.status.replace(/-/g, ' ') }}</b></p>
        </section>
        <section class="md:col-span-2">
          <h3 class="mb-2 text-xs font-bold tracking-wide text-muted uppercase">Items</h3>
          <table class="w-full text-sm">
            <tbody class="divide-y divide-line">
              <tr v-for="l in selected.lines" :key="l.productId">
                <td class="py-1.5 text-ink">{{ l.name }} <span class="text-muted">· {{ l.size }}</span></td>
                <td class="py-1.5 text-right text-muted tabular-nums">{{ l.quantity }} × {{ formatLKR(l.unitPriceCents) }}</td>
                <td class="py-1.5 text-right font-semibold tabular-nums">{{ formatLKR(l.finalCents) }}</td>
              </tr>
            </tbody>
          </table>
          <div class="mt-3 rounded-xl bg-white p-3 ring-1 ring-line"><CartSummary :bill="selected.breakdown" :show-hints="false" /></div>
        </section>
        <section class="md:col-span-2">
          <h3 class="mb-2 text-xs font-bold tracking-wide text-muted uppercase">History</h3>
          <ol class="space-y-2 border-l-2 border-line pl-4">
            <li v-for="(h, i) in selected.history" :key="i" class="text-sm">
              <AdminBadge :value="h.status" /> <span class="text-muted">{{ fmt(h.at) }} · {{ h.by }}</span>
              <p v-if="h.note" class="mt-0.5 text-xs text-muted">“{{ h.note }}”</p>
            </li>
          </ol>
        </section>
      </div>
      <template v-if="selected" #footer>
        <span v-if="!actionsFor(selected).length" class="mr-auto text-xs text-muted">{{ auth.can('orders.manage') ? 'No further steps for this order.' : 'You can view orders but not update them.' }}</span>
        <button
          v-for="s in actionsFor(selected)"
          :key="s"
          type="button"
          class="h-9"
          :class="s === 'cancelled' || s === 'refunded' ? 'btn-ghost text-[#8A2E2E]' : 'btn-primary'"
          :disabled="busy"
          @click="move(selected, s)"
        >
          {{ LABEL[s] }}
        </button>
      </template>
    </AdminModal>
  </div>
</template>
