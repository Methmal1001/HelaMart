<script setup lang="ts">
import type { Customer, TableColumn } from '~/types/admin'
import { DISTRICTS, PROVINCE_OF, type District } from '~/data/sriLanka'
import { listAllCustomers, setCustomerAccountStatus } from '~/services/admin/platformApi'

type Row = Customer & { tenantNames: string[] }

const auth = useAdminAuth()
const notify = useAdminNotify()
const { confirm } = useAdminConfirm()
const customers = ref<Row[]>([])
const loading = ref(true)
const district = ref('all')
const province = ref('all')

async function load() {
  loading.value = true
  try {
    customers.value = await auth.call(listAllCustomers)
  } catch (e) {
    notify.error(e)
  } finally {
    loading.value = false
  }
}
onMounted(load)

const provinces = [...new Set(Object.values(PROVINCE_OF))]
const provinceOf = (d: string) => PROVINCE_OF[d as District] ?? '—'
const rows = computed(() => customers.value.filter((c) => (district.value === 'all' || c.district === district.value) && (province.value === 'all' || provinceOf(c.district) === province.value)))
const columns: TableColumn[] = [
  { key: 'name', label: 'Customer', sortable: true, value: (c: Row) => `${c.name} ${c.email}` },
  { key: 'phone', label: 'Mobile', value: (c: { phone?: string }) => c.phone ?? '' },
  { key: 'district', label: 'District', sortable: true, value: (c: Row) => `${c.district} ${provinceOf(c.district)}` },
  { key: 'tenantNames', label: 'Shops at', value: (c: Row) => c.tenantNames.join(', ') },
  { key: 'ordersCount', label: 'Orders', sortable: true, align: 'right' },
  { key: 'totalSpentCents', label: 'Spent', sortable: true, align: 'right' },
  { key: 'status', label: 'Account', sortable: true },
  { key: 'actions', label: '', align: 'right', value: () => '' },
]

async function toggle(c: Row) {
  const block = c.status === 'active'
  const r = await confirm({
    title: block ? `Suspend ${c.name}’s HelaMart account?` : `Reinstate ${c.name}?`,
    message: block ? 'They can’t sign in or order from any supermarket on HelaMart.' : 'They can sign in and shop again.',
    confirmLabel: block ? 'Suspend account' : 'Reinstate',
    tone: block ? 'danger' : 'default',
    reasonLabel: block ? 'Reason' : undefined,
  })
  if (!r.ok) return
  try {
    await auth.call((t) => setCustomerAccountStatus(t, c.id, block ? 'blocked' : 'active', r.reason), 'Suspending accounts needs your password confirmed.')
    await load()
  } catch (e) {
    notify.error(e)
  }
}
</script>

<template>
  <div>
    <AdminPageHeader title="Customers — all of Sri Lanka" description="Every shopper registered on HelaMart, and the supermarkets they shop at." />
    <AdminDataTable :rows="rows" :columns="columns" row-key="id" :loading="loading" search-placeholder="Search name, email, mobile, district or supermarket…">
      <template #toolbar>
        <select v-model="province" class="field w-auto" aria-label="Province"><option value="all">All provinces</option><option v-for="p in provinces" :key="p" :value="p">{{ p }}</option></select>
        <select v-model="district" class="field w-auto" aria-label="District"><option value="all">All districts</option><option v-for="d in DISTRICTS" :key="d" :value="d">{{ d }}</option></select>
      </template>
      <template #cell-name="{ row }">
        <div class="flex items-center gap-2.5"><UserAvatar :name="row.name" :size="30" /><span class="min-w-0"><span class="block font-semibold text-ink">{{ row.name }}</span><span class="block truncate text-xs text-muted">{{ row.email }}</span></span></div>
      </template>
      <template #cell-phone="{ row }"><a v-if="row.phone" :href="`tel:${row.phone.replace(/\s/g, '')}`" class="whitespace-nowrap text-ink tabular-nums hover:text-hela-green hover:underline">{{ row.phone }}</a><span v-else class="text-xs font-semibold text-[#8A2E2E]">Not added</span></template>
      <template #cell-district="{ row }"><span class="text-ink">{{ row.district }}</span><span class="block text-xs text-muted">{{ provinceOf(row.district) }}</span></template>
      <template #cell-tenantNames="{ row }"><span class="text-xs text-muted">{{ row.tenantNames.join(', ') || '—' }}</span></template>
      <template #cell-totalSpentCents="{ row }"><span class="tabular-nums">{{ formatLKR(row.totalSpentCents) }}</span></template>
      <template #cell-status="{ row }"><AdminBadge :value="row.status" :label="row.status === 'blocked' ? 'Suspended' : 'Active'" /></template>
      <template #cell-actions="{ row }">
        <button v-if="auth.can('customers.all.manage')" type="button" class="btn-ghost h-8 px-2.5 text-xs" :class="row.status === 'active' ? 'text-[#8A2E2E]' : ''" @click="toggle(row)">{{ row.status === 'active' ? 'Suspend' : 'Reinstate' }}</button>
      </template>
    </AdminDataTable>
  </div>
</template>
