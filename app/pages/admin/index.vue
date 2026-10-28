<script setup lang="ts">
import type { DashboardStats, StaffTask } from '~/types/admin'
import { getDashboard, listTasks } from '~/services/admin/api'

definePageMeta({ layout: 'admin', middleware: 'admin', permission: 'dashboard.view' })
useHead({ title: 'Dashboard' })

const auth = useAdminAuth()
const notify = useAdminNotify()
const stats = ref<DashboardStats | null>(null)
const myTasks = ref<StaffTask[]>([])
const showMoney = computed(() => auth.can('reports.view'))

onMounted(async () => {
  try {
    stats.value = await auth.call(getDashboard)
    if (auth.can('tasks.view')) {
      const r = await auth.call(listTasks)
      myTasks.value = r.tasks.filter((t) => t.assigneeId === auth.user.value?.id && t.status !== 'done').slice(0, 5)
    }
  } catch (e) {
    notify.error(e)
  }
})

const greeting = computed(() => {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
})
const maxStatus = computed(() => Math.max(1, ...(stats.value?.ordersByStatus.map((s) => s.count) ?? [1])))
const fmtDate = (iso: string) => new Date(iso).toLocaleString('en-LK', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
</script>

<template>
  <div>
    <AdminPageHeader :title="`${greeting}, ${auth.user.value?.name.split(' ')[0] ?? ''}`" description="Here’s how HelaMart is doing today.">
      <NuxtLink v-if="auth.can('orders.view')" to="/admin/orders" class="btn-primary h-10">
        <AppIcon name="receipt" :size="17" />
        Orders to process
        <span v-if="stats?.pendingOrders" class="rounded-md bg-hela-gold px-1.5 text-xs text-hela-green-900">{{ stats.pendingOrders }}</span>
      </NuxtLink>
    </AdminPageHeader>

    <p v-if="!stats" class="text-sm text-muted">Loading dashboard…</p>
    <template v-else>
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AdminStatCard v-if="showMoney" label="Revenue today" :value="formatLKR(stats.revenueTodayCents)" icon="cash" />
        <AdminStatCard v-if="showMoney" label="Revenue (30 days)" :value="formatLKR(stats.revenue30dCents)" :hint="`Avg order ${formatLKR(stats.avgOrderCents)}`" icon="receipt" />
        <AdminStatCard label="Orders (30 days)" :value="String(stats.orders30d)" :hint="`${stats.pendingOrders} waiting to be packed`" icon="package" tone="gold" />
        <AdminStatCard label="Customers" :value="String(stats.customers)" :hint="`${stats.newCustomers30d} new this month`" icon="users" />
        <AdminStatCard v-if="!showMoney" label="Low-stock items" :value="String(stats.lowStock.length)" icon="alert" tone="red" />
      </div>

      <div class="mt-4 grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <RevenueChart :data="stats.revenueByDay" :show-money="showMoney" :title="showMoney ? 'Daily revenue — last 14 days' : 'Daily orders — last 14 days'" />

        <section class="card p-4" aria-labelledby="status-h">
          <h2 id="status-h" class="mb-3 text-sm font-bold text-ink">Orders by status</h2>
          <ul class="space-y-2.5">
            <li v-for="s in stats.ordersByStatus" :key="s.status" class="grid grid-cols-[8.5rem_1fr_2.5rem] items-center gap-2 text-sm">
              <AdminBadge :value="s.status" />
              <span class="h-2 overflow-hidden rounded-full bg-cream" aria-hidden="true">
                <span class="block h-full rounded-full bg-hela-green" :style="{ width: `${(s.count / maxStatus) * 100}%` }" />
              </span>
              <span class="text-right font-semibold tabular-nums">{{ s.count }}</span>
            </li>
          </ul>
        </section>
      </div>

      <div class="mt-4 grid gap-4 lg:grid-cols-3">
        <section class="card p-4" aria-labelledby="recent-h">
          <div class="mb-3 flex items-center justify-between">
            <h2 id="recent-h" class="text-sm font-bold text-ink">Recent orders</h2>
            <NuxtLink v-if="auth.can('orders.view')" to="/admin/orders" class="text-xs font-semibold text-hela-green hover:underline">All orders</NuxtLink>
          </div>
          <ul class="divide-y divide-line">
            <li v-for="o in stats.recentOrders" :key="o.id" class="flex items-center justify-between gap-2 py-2 text-sm">
              <span class="min-w-0">
                <span class="block font-semibold text-ink">{{ o.number }}</span>
                <span class="block truncate text-xs text-muted">{{ o.customerName }} · {{ fmtDate(o.createdAt) }}</span>
              </span>
              <AdminBadge :value="o.status" />
            </li>
          </ul>
        </section>

        <section class="card p-4" aria-labelledby="stock-h">
          <div class="mb-3 flex items-center justify-between">
            <h2 id="stock-h" class="text-sm font-bold text-ink">Low stock</h2>
            <NuxtLink v-if="auth.can('products.view')" to="/admin/products?filter=low" class="text-xs font-semibold text-hela-green hover:underline">Manage stock</NuxtLink>
          </div>
          <p v-if="!stats.lowStock.length" class="text-sm text-muted">Everything is well stocked.</p>
          <ul class="divide-y divide-line">
            <li v-for="p in stats.lowStock" :key="p.id" class="flex items-center justify-between gap-2 py-2 text-sm">
              <span class="truncate text-ink">{{ p.name }}</span>
              <AdminBadge :value="p.stock === 0 ? 'out_of_stock' : 'low_stock'" :label="p.stock === 0 ? 'Out of stock' : `${p.stock} left`" />
            </li>
          </ul>
        </section>

        <section class="card p-4" aria-labelledby="top-h">
          <h2 id="top-h" class="mb-3 text-sm font-bold text-ink">Best sellers (30 days)</h2>
          <ol class="space-y-2">
            <li v-for="(p, i) in stats.topProducts" :key="p.id" class="flex items-center gap-2 text-sm">
              <span class="grid size-6 shrink-0 place-items-center rounded-full bg-hela-green-50 text-xs font-bold text-hela-green">{{ i + 1 }}</span>
              <span class="min-w-0 flex-1 truncate text-ink">{{ p.name }}</span>
              <span class="text-xs text-muted tabular-nums">{{ p.units }} sold</span>
            </li>
          </ol>
        </section>
      </div>

      <section v-if="auth.can('tasks.view')" class="card mt-4 p-4" aria-labelledby="mytasks-h">
        <div class="mb-3 flex items-center justify-between">
          <h2 id="mytasks-h" class="text-sm font-bold text-ink">My open tasks</h2>
          <NuxtLink to="/admin/tasks" class="text-xs font-semibold text-hela-green hover:underline">Task board</NuxtLink>
        </div>
        <p v-if="!myTasks.length" class="text-sm text-muted">Nothing assigned to you right now.</p>
        <ul class="divide-y divide-line">
          <li v-for="t in myTasks" :key="t.id" class="flex items-center justify-between gap-2 py-2 text-sm">
            <span class="min-w-0 truncate text-ink">{{ t.title }}</span>
            <span class="flex shrink-0 items-center gap-2"><AdminBadge :value="t.priority" /><span class="text-xs text-muted">Due {{ t.dueDate }}</span></span>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>
