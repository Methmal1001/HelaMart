<script setup lang="ts">
import type { AdminOrder, TableColumn } from '~/types/admin'
import { DISTRICTS, PROVINCE_OF } from '~/data/sriLanka'
import { chainCustomerOrders, listChainCustomers, setChainCustomerBlock, type ChainCustomer } from '~/services/admin/tenantApi'

const auth = useAdminAuth()
const notify = useAdminNotify()
const { confirm } = useAdminConfirm()
const customers = ref<ChainCustomer[]>([])
const loading = ref(true)
const district = ref('all')
const selected = ref<ChainCustomer | null>(null)
const orders = ref<AdminOrder[]>([])

async function load() {
  loading.value = true
  try {
    customers.value = await auth.call(listChainCustomers)
  } catch (e) {
    notify.error(e)
  } finally {
    loading.value = false
  }
}
onMounted(load)

const rows = computed(() => customers.value.filter((c) => district.value === 'all' || c.district === district.value))
const districtsUsed = computed(() => DISTRICTS.filter((d) => customers.value.some((c) => c.district === d)))
const columns: TableColumn[] = [
  { key: 'name', label: 'Customer', sortable: true, value: (c: ChainCustomer) => `${c.name} ${c.email}` },
  { key: 'district', label: 'District', sortable: true, value: (c: ChainCustomer) => `${c.district} ${PROVINCE_OF[c.district as keyof typeof PROVINCE_OF] ?? ''}` },
  { key: 'chainOrders', label: 'Orders with you', sortable: true, align: 'right' },
  { key: 'chainSpentCents', label: 'Spent with you', sortable: true, align: 'right' },
  { key: 'createdAt', label: 'Joined', sortable: true },
  { key: 'status', label: 'Status', value: (c: ChainCustomer) => (c.blockedHere ? 'blocked' : c.status) },
]
const day = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('en-LK', { day: 'numeric', month: 'short', year: 'numeric' }) : '—')

async function open(c: ChainCustomer) {
  selected.value = c
  orders.value = []
  if (auth.can('orders.view')) {
    try {
      orders.value = await auth.call((t) => chainCustomerOrders(t, c.id))
    } catch (e) {
      notify.error(e)
    }
  }
}

async function toggleBlock(c: ChainCustomer) {
  const block = !c.blockedHere
  const r = await confirm({
    title: block ? `Block ${c.name} from ${auth.user.value?.tenantName}?` : `Unblock ${c.name}?`,
    message: block ? 'They won’t be able to order from any of your branches. Their HelaMart account and other supermarkets are not affected.' : 'They can order from your branches again.',
    confirmLabel: block ? 'Block customer' : 'Unblock',
    tone: block ? 'danger' : 'default',
    reasonLabel: block ? 'Reason' : undefined,
  })
  if (!r.ok) return
  try {
    await auth.call((t) => setChainCustomerBlock(t, c.id, block, r.reason), 'Blocking customers needs your password confirmed.')
    notify.ok(block ? `${c.name} blocked from your stores` : `${c.name} unblocked`)
    await load()
    selected.value = customers.value.find((x) => x.id === c.id) ?? null
  } catch (e) {
    notify.error(e)
  }
}
</script>

<template>
  <div>
    <AdminPageHeader title="Customers" :description="`Shoppers registered with ${auth.user.value?.tenantName} across Sri Lanka.`" />
    <AdminDataTable :rows="rows" :columns="columns" row-key="id" :loading="loading" clickable search-placeholder="Search name, email or district…" @row-click="open">
      <template #toolbar>
        <select v-model="district" class="field w-auto" aria-label="District">
          <option value="all">All districts</option>
          <option v-for="d in districtsUsed" :key="d" :value="d">{{ d }}</option>
        </select>
      </template>
      <template #cell-name="{ row }">
        <div class="flex items-center gap-2.5"><UserAvatar :name="row.name" :size="30" /><span class="min-w-0"><span class="block font-semibold text-ink">{{ row.name }}</span><span class="block truncate text-xs text-muted">{{ row.email }}</span></span></div>
      </template>
      <template #cell-district="{ row }"><span class="text-ink">{{ row.district }}</span></template>
      <template #cell-chainSpentCents="{ row }"><span class="tabular-nums">{{ formatLKR(row.chainSpentCents) }}</span></template>
      <template #cell-createdAt="{ row }"><span class="text-muted">{{ day(row.createdAt) }}</span></template>
      <template #cell-status="{ row }"><AdminBadge :value="row.blockedHere || row.status === 'blocked' ? 'blocked' : 'active'" :label="row.blockedHere ? 'Blocked by you' : row.status === 'blocked' ? 'Suspended by HelaMart' : 'Active'" /></template>
    </AdminDataTable>

    <AdminModal :open="!!selected" :title="selected?.name ?? ''" :description="selected?.email" size="lg" @close="selected = null">
      <div v-if="selected" class="space-y-4 text-sm">
        <dl class="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div class="card p-3"><dt class="text-xs text-muted">Orders with you</dt><dd class="text-lg font-bold">{{ selected.chainOrders }}</dd></div>
          <div class="card p-3"><dt class="text-xs text-muted">Spent with you</dt><dd class="text-lg font-bold tabular-nums">{{ formatLKR(selected.chainSpentCents) }}</dd></div>
          <div class="card p-3"><dt class="text-xs text-muted">District</dt><dd class="font-semibold">{{ selected.district }}</dd></div>
          <div class="card p-3"><dt class="text-xs text-muted">Joined HelaMart</dt><dd class="font-semibold">{{ day(selected.createdAt) }}</dd></div>
        </dl>
        <p class="text-muted">Phone: {{ selected.phone ?? '—' }} · Signs in with {{ selected.provider === 'google' ? 'Google' : 'email & password' }}</p>
        <section v-if="auth.can('orders.view')">
          <h3 class="mb-2 text-xs font-bold tracking-wide text-muted uppercase">Orders at your branches</h3>
          <p v-if="!orders.length" class="text-muted">No orders at your branches.</p>
          <ul class="divide-y divide-line">
            <li v-for="o in orders" :key="o.id" class="flex items-center justify-between gap-2 py-2"><span><b class="text-ink">{{ o.number }}</b> <span class="text-muted">· {{ day(o.createdAt) }}</span></span><span class="flex items-center gap-2"><span class="tabular-nums">{{ formatLKR(o.breakdown.totalCents) }}</span><AdminBadge :value="o.status" /></span></li>
          </ul>
        </section>
      </div>
      <template v-if="selected && auth.can('customers.manage') && !auth.readOnly.value" #footer>
        <button type="button" class="h-9" :class="selected.blockedHere ? 'btn-primary' : 'btn-ghost text-[#8A2E2E]'" @click="toggleBlock(selected)">{{ selected.blockedHere ? 'Unblock customer' : 'Block from my stores' }}</button>
      </template>
    </AdminModal>
  </div>
</template>
