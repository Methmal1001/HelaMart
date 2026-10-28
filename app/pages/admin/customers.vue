<script setup lang="ts">
import type { AdminOrder, Customer, TableColumn } from '~/types/admin'
import { customerOrders, listCustomers, setCustomerStatus } from '~/services/admin/api'

definePageMeta({ layout: 'admin', middleware: 'admin', permission: 'customers.view' })
useHead({ title: 'Customers' })

const auth = useAdminAuth()
const notify = useAdminNotify()
const { confirm } = useAdminConfirm()
const customers = ref<Customer[]>([])
const loading = ref(true)
const selected = ref<Customer | null>(null)
const orders = ref<AdminOrder[]>([])

onMounted(async () => {
  try {
    customers.value = await auth.call(listCustomers)
  } catch (e) {
    notify.error(e)
  } finally {
    loading.value = false
  }
})

async function open(c: Customer) {
  selected.value = c
  orders.value = []
  if (auth.can('orders.view')) {
    try {
      orders.value = await auth.call((t) => customerOrders(t, c.id))
    } catch (e) {
      notify.error(e)
    }
  }
}

async function toggleBlock(c: Customer) {
  const block = c.status === 'active'
  const r = await confirm({
    title: block ? `Block ${c.name}?` : `Unblock ${c.name}?`,
    message: block ? 'They won’t be able to sign in or place orders until unblocked.' : 'They’ll be able to sign in and shop again.',
    confirmLabel: block ? 'Block customer' : 'Unblock',
    tone: block ? 'danger' : 'default',
    reasonLabel: block ? 'Reason for blocking' : undefined,
  })
  if (!r.ok) return
  try {
    const u = await auth.call((t) => setCustomerStatus(t, c.id, block ? 'blocked' : 'active', r.reason), 'Blocking customers needs your password confirmed.')
    customers.value = customers.value.map((x) => (x.id === u.id ? u : x))
    selected.value = u
    notify.ok(block ? `${u.name} blocked` : `${u.name} unblocked`)
  } catch (e) {
    notify.error(e)
  }
}

const columns: TableColumn[] = [
  { key: 'name', label: 'Customer', sortable: true, value: (c: Customer) => `${c.name} ${c.email}` },
  { key: 'city', label: 'City', sortable: true },
  { key: 'provider', label: 'Sign-in', sortable: true },
  { key: 'ordersCount', label: 'Orders', sortable: true, align: 'right' },
  { key: 'totalSpentCents', label: 'Spent', sortable: true, align: 'right' },
  { key: 'createdAt', label: 'Joined', sortable: true },
  { key: 'status', label: 'Status', sortable: true },
]
const day = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('en-LK', { day: 'numeric', month: 'short', year: 'numeric' }) : '—')
</script>

<template>
  <div>
    <AdminPageHeader title="Customers" description="Customer accounts, order history and account status." />
    <AdminDataTable :rows="customers" :columns="columns" row-key="id" :loading="loading" clickable search-placeholder="Search name, email or city…" @row-click="open">
      <template #cell-name="{ row }">
        <div class="flex items-center gap-2.5">
          <UserAvatar :name="row.name" :size="30" />
          <span class="min-w-0"><span class="block font-semibold text-ink">{{ row.name }}</span><span class="block truncate text-xs text-muted">{{ row.email }}</span></span>
        </div>
      </template>
      <template #cell-provider="{ row }"><span class="text-xs text-muted">{{ row.provider === 'google' ? 'Google' : 'Email' }}</span></template>
      <template #cell-totalSpentCents="{ row }"><span class="tabular-nums">{{ formatLKR(row.totalSpentCents) }}</span></template>
      <template #cell-createdAt="{ row }"><span class="text-muted">{{ day(row.createdAt) }}</span></template>
      <template #cell-status="{ row }"><AdminBadge :value="row.status" /></template>
    </AdminDataTable>

    <AdminModal :open="!!selected" :title="selected?.name ?? ''" :description="selected?.email" size="lg" @close="selected = null">
      <div v-if="selected" class="space-y-4">
        <dl class="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div class="card p-3"><dt class="text-xs text-muted">Orders</dt><dd class="text-lg font-bold">{{ selected.ordersCount }}</dd></div>
          <div class="card p-3"><dt class="text-xs text-muted">Total spent</dt><dd class="text-lg font-bold tabular-nums">{{ formatLKR(selected.totalSpentCents) }}</dd></div>
          <div class="card p-3"><dt class="text-xs text-muted">Joined</dt><dd class="font-semibold">{{ day(selected.createdAt) }}</dd></div>
          <div class="card p-3"><dt class="text-xs text-muted">Status</dt><dd><AdminBadge :value="selected.status" /></dd></div>
        </dl>
        <p class="text-sm text-muted">Phone: {{ selected.phone ?? '—' }} · City: {{ selected.city }} · Signs in with {{ selected.provider === 'google' ? 'Google' : 'email & password' }}</p>
        <section v-if="auth.can('orders.view')">
          <h3 class="mb-2 text-xs font-bold tracking-wide text-muted uppercase">Orders</h3>
          <p v-if="!orders.length" class="text-sm text-muted">No orders yet.</p>
          <ul class="divide-y divide-line">
            <li v-for="o in orders" :key="o.id" class="flex items-center justify-between gap-2 py-2 text-sm">
              <span><b class="text-ink">{{ o.number }}</b> <span class="text-muted">· {{ day(o.createdAt) }}</span></span>
              <span class="flex items-center gap-2"><span class="tabular-nums">{{ formatLKR(o.breakdown.totalCents) }}</span><AdminBadge :value="o.status" /></span>
            </li>
          </ul>
        </section>
      </div>
      <template v-if="selected && auth.can('customers.manage')" #footer>
        <button type="button" class="h-9" :class="selected.status === 'active' ? 'btn-ghost text-[#8A2E2E]' : 'btn-primary'" @click="toggleBlock(selected)">
          {{ selected.status === 'active' ? 'Block customer' : 'Unblock customer' }}
        </button>
      </template>
    </AdminModal>
  </div>
</template>
