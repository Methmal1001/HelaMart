<script setup lang="ts">
import type { StaffTask, TenantDashboard } from '~/types/admin'
import { branchDirectory, getTenantDashboard } from '~/services/admin/tenantApi'
import { listTasks } from '~/services/admin/common'

const auth = useAdminAuth()
const notify = useAdminNotify()
const stats = ref<TenantDashboard | null>(null)
const myTasks = ref<StaffTask[]>([])
const branches = ref<{ id: string; name: string; status: string }[]>([])
const branch = ref<string>('all')
const showMoney = computed(() => auth.can('reports.view'))

async function load() {
  try {
    stats.value = await auth.call((t) => getTenantDashboard(t, branch.value))
  } catch (e) {
    notify.error(e)
  }
}
onMounted(async () => {
  try {
    branches.value = await auth.call(branchDirectory)
    if (branches.value.length === 1) branch.value = branches.value[0]!.id
    await load()
    if (auth.can('tasks.view')) {
      const r = await auth.call(listTasks)
      myTasks.value = r.tasks.filter((t) => t.assigneeId === auth.user.value?.id && t.status !== 'done').slice(0, 5)
    }
  } catch (e) {
    notify.error(e)
  }
})
watch(branch, load)

const branchName = (id: string) => branches.value.find((b) => b.id === id)?.name ?? ''
const greeting = computed(() => {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
})
const maxStatus = computed(() => Math.max(1, ...(stats.value?.ordersByStatus.map((s) => s.count) ?? [1])))
const fmtDate = (iso: string) => new Date(iso).toLocaleString('en-LK', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
</script>

<template>
  <div>
    <AdminPageHeader :title="`${greeting}, ${auth.user.value?.name.split(' ')[0] ?? ''}`" :description="`${auth.user.value?.tenantName} — ${branch === 'all' ? 'all branches' : branchName(branch)}`">
      <select v-if="branches.length > 1" v-model="branch" class="field h-10 w-auto" aria-label="Branch">
        <option value="all">All my branches</option>
        <option v-for="b in branches" :key="b.id" :value="b.id">{{ b.name }}</option>
      </select>
      <NuxtLink v-if="auth.can('orders.view')" to="/admin/orders" class="btn-primary h-10">
        <AppIcon name="receipt" :size="17" />Orders to process
        <span v-if="stats?.pendingOrders" class="rounded-md bg-hela-gold px-1.5 text-xs text-hela-green-900">{{ stats.pendingOrders }}</span>
      </NuxtLink>
    </AdminPageHeader>

    <p v-if="!stats" class="text-sm text-muted">Loading dashboard…</p>
    <template v-else>
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AdminStatCard v-if="showMoney" label="Revenue (30 days)" :value="formatLKR(stats.revenue30dCents)" :hint="`Today ${formatLKR(stats.revenueTodayCents)} · avg ${formatLKR(stats.avgOrderCents)}`" icon="cash" />
        <AdminStatCard label="Orders (30 days)" :value="String(stats.orders30d)" :hint="`${stats.pendingOrders} waiting to be packed`" icon="package" tone="gold" />
        <AdminStatCard label="Branches open" :value="`${stats.branchesOpen} / ${stats.branchesTotal}`" icon="store" />
        <AdminStatCard label="Registered customers" :value="String(stats.customers)" :hint="`${stats.newCustomers30d} new this month · all of Sri Lanka`" icon="users" />
      </div>

      <div class="mt-4 grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <RevenueChart :data="stats.revenueByDay" :show-money="showMoney" :title="showMoney ? 'Daily revenue — last 14 days' : 'Daily orders — last 14 days'" />
        <section class="card p-4" aria-labelledby="status-h">
          <h2 id="status-h" class="mb-3 text-sm font-bold text-ink">Orders by status</h2>
          <ul class="space-y-2.5">
            <li v-for="s in stats.ordersByStatus" :key="s.status" class="grid grid-cols-[8.5rem_1fr_2.5rem] items-center gap-2 text-sm">
              <AdminBadge :value="s.status" />
              <span class="h-2 overflow-hidden rounded-full bg-cream" aria-hidden="true"><span class="block h-full rounded-full bg-hela-green" :style="{ width: `${(s.count / maxStatus) * 100}%` }" /></span>
              <span class="text-right font-semibold tabular-nums">{{ s.count }}</span>
            </li>
          </ul>
        </section>
      </div>

      <section v-if="stats.byBranch.length > 1" class="card mt-4 overflow-x-auto p-4" aria-labelledby="branch-h">
        <h2 id="branch-h" class="mb-3 text-sm font-bold text-ink">Branch performance (30 days)</h2>
        <table class="w-full text-sm">
          <thead class="text-xs text-muted"><tr><th class="py-1 text-left font-semibold">Branch</th><th class="py-1 text-right font-semibold">Orders</th><th v-if="showMoney" class="py-1 text-right font-semibold">Revenue</th></tr></thead>
          <tbody class="divide-y divide-line">
            <tr v-for="b in stats.byBranch" :key="b.id"><td class="py-2 font-semibold text-ink">{{ b.name }}</td><td class="py-2 text-right tabular-nums">{{ b.orders }}</td><td v-if="showMoney" class="py-2 text-right tabular-nums">{{ formatLKR(b.cents) }}</td></tr>
          </tbody>
        </table>
      </section>

      <div class="mt-4 grid gap-4 lg:grid-cols-3">
        <section class="card p-4" aria-labelledby="recent-h">
          <div class="mb-3 flex items-center justify-between"><h2 id="recent-h" class="text-sm font-bold text-ink">Recent orders</h2><NuxtLink v-if="auth.can('orders.view')" to="/admin/orders" class="text-xs font-semibold text-hela-green hover:underline">All orders</NuxtLink></div>
          <ul class="divide-y divide-line">
            <li v-for="o in stats.recentOrders" :key="o.id" class="flex items-center justify-between gap-2 py-2 text-sm">
              <span class="min-w-0"><span class="block font-semibold text-ink">{{ o.number }}</span><span class="block truncate text-xs text-muted">{{ branchName(o.branchId) }} · {{ o.customerName }} · {{ fmtDate(o.createdAt) }}</span></span>
              <AdminBadge :value="o.status" />
            </li>
          </ul>
        </section>
        <section class="card p-4" aria-labelledby="stock-h">
          <div class="mb-3 flex items-center justify-between"><h2 id="stock-h" class="text-sm font-bold text-ink">Low stock</h2><NuxtLink v-if="auth.can('products.view')" to="/admin/products?filter=low" class="text-xs font-semibold text-hela-green hover:underline">Manage stock</NuxtLink></div>
          <p v-if="!stats.lowStock.length" class="text-sm text-muted">Everything is well stocked.</p>
          <ul class="divide-y divide-line">
            <li v-for="p in stats.lowStock" :key="p.id + p.branch" class="flex items-center justify-between gap-2 py-2 text-sm">
              <span class="min-w-0"><span class="block truncate text-ink">{{ p.name }}</span><span class="block text-xs text-muted">{{ p.branch }}</span></span>
              <AdminBadge :value="p.stock === 0 ? 'out_of_stock' : 'low_stock'" :label="p.stock === 0 ? 'Out of stock' : `${p.stock} left`" />
            </li>
          </ul>
        </section>
        <section class="card p-4" aria-labelledby="top-h">
          <h2 id="top-h" class="mb-3 text-sm font-bold text-ink">Best sellers (30 days)</h2>
          <ol class="space-y-2">
            <li v-for="(p, i) in stats.topProducts" :key="p.id" class="flex items-center gap-2 text-sm">
              <span class="grid size-6 shrink-0 place-items-center rounded-full bg-hela-green-50 text-xs font-bold text-hela-green">{{ i + 1 }}</span>
              <span class="min-w-0 flex-1 truncate text-ink">{{ p.name }}</span><span class="text-xs text-muted tabular-nums">{{ p.units }} sold</span>
            </li>
          </ol>
        </section>
      </div>

      <section v-if="auth.can('tasks.view')" class="card mt-4 p-4" aria-labelledby="mytasks-h">
        <div class="mb-3 flex items-center justify-between"><h2 id="mytasks-h" class="text-sm font-bold text-ink">My open tasks</h2><NuxtLink to="/admin/tasks" class="text-xs font-semibold text-hela-green hover:underline">Task board</NuxtLink></div>
        <p v-if="!myTasks.length" class="text-sm text-muted">Nothing assigned to you right now.</p>
        <ul class="divide-y divide-line">
          <li v-for="t in myTasks" :key="t.id" class="flex items-center justify-between gap-2 py-2 text-sm"><span class="min-w-0 truncate text-ink">{{ t.title }}</span><span class="flex shrink-0 items-center gap-2"><AdminBadge :value="t.priority" /><span class="text-xs text-muted">Due {{ t.dueDate }}</span></span></li>
        </ul>
      </section>
    </template>
  </div>
</template>
