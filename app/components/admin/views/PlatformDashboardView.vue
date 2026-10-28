<script setup lang="ts">
import type { PlatformDashboard } from '~/types/admin'
import { getPlatformDashboard } from '~/services/admin/platformApi'

const auth = useAdminAuth()
const notify = useAdminNotify()
const stats = ref<PlatformDashboard | null>(null)

onMounted(async () => {
  try {
    stats.value = await auth.call(getPlatformDashboard)
  } catch (e) {
    notify.error(e)
  }
})

const count = (s: string) => stats.value?.tenantsByStatus.find((x) => x.status === s)?.count ?? 0
const maxProvince = computed(() => Math.max(1, ...(stats.value?.customersByProvince.map((p) => p.count) ?? [1])))
const day = (iso: string) => new Date(iso).toLocaleDateString('en-LK', { day: 'numeric', month: 'short' })
</script>

<template>
  <div>
    <AdminPageHeader title="HelaMart platform" description="Every supermarket on HelaMart, across Sri Lanka.">
      <NuxtLink v-if="auth.can('tenants.view')" to="/admin/supermarkets?status=pending" class="btn-primary h-10">
        <AppIcon name="clipboard" :size="17" />Review applications
        <span v-if="count('pending')" class="rounded-md bg-hela-gold px-1.5 text-xs text-hela-green-900">{{ count('pending') }}</span>
      </NuxtLink>
    </AdminPageHeader>

    <p v-if="!stats" class="text-sm text-muted">Loading…</p>
    <template v-else>
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AdminStatCard label="Active supermarkets" :value="String(count('active'))" :hint="`${stats.branches} branches island-wide`" icon="store" />
        <AdminStatCard label="Awaiting review" :value="String(count('pending'))" :hint="`${count('restricted')} restricted · ${count('banned')} banned`" icon="clipboard" tone="gold" />
        <AdminStatCard label="Platform sales (30 days)" :value="formatLKR(stats.gmv30dCents)" :hint="`${stats.orders30d} orders · commission ${formatLKR(stats.commission30dCents)}`" icon="cash" />
        <AdminStatCard label="Registered shoppers" :value="String(stats.customers)" :hint="`${stats.newCustomers30d} joined this month`" icon="users" />
      </div>

      <div class="mt-4 grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <RevenueChart :data="stats.gmvByDay" show-money title="Platform sales — last 14 days" />
        <section class="card p-4" aria-labelledby="apps-h">
          <h2 id="apps-h" class="mb-3 text-sm font-bold text-ink">New supermarket applications</h2>
          <p v-if="!stats.pendingApplications.length" class="text-sm text-muted">No applications waiting.</p>
          <ul class="divide-y divide-line">
            <li v-for="a in stats.pendingApplications" :key="a.id" class="flex items-center justify-between gap-2 py-2.5 text-sm">
              <span class="min-w-0"><span class="block font-semibold text-ink">{{ a.name }}</span><span class="block text-xs text-muted">{{ a.reference }} · {{ a.district }} · {{ day(a.createdAt) }}</span></span>
              <NuxtLink :to="`/admin/supermarkets?open=${a.id}`" class="btn-ghost h-8 px-3 text-xs">Review</NuxtLink>
            </li>
          </ul>
        </section>
      </div>

      <div class="mt-4 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <section class="card overflow-x-auto p-4" aria-labelledby="top-h">
          <h2 id="top-h" class="mb-3 text-sm font-bold text-ink">Supermarkets (30 days)</h2>
          <table class="w-full text-sm">
            <thead class="text-xs text-muted"><tr><th class="py-1 text-left font-semibold">Supermarket</th><th class="py-1 text-left font-semibold">Status</th><th class="py-1 text-right font-semibold">Branches</th><th class="py-1 text-right font-semibold">Orders</th><th class="py-1 text-right font-semibold">Sales</th></tr></thead>
            <tbody class="divide-y divide-line">
              <tr v-for="t in stats.topTenants" :key="t.id">
                <td class="py-2"><NuxtLink :to="`/admin/supermarkets?open=${t.id}`" class="font-semibold text-ink hover:text-hela-green">{{ t.name }}</NuxtLink></td>
                <td class="py-2"><AdminBadge :value="t.status" /></td>
                <td class="py-2 text-right tabular-nums">{{ t.branches }}</td>
                <td class="py-2 text-right tabular-nums">{{ t.orders }}</td>
                <td class="py-2 text-right tabular-nums">{{ formatLKR(t.cents) }}</td>
              </tr>
            </tbody>
          </table>
        </section>
        <section class="card p-4" aria-labelledby="prov-h">
          <h2 id="prov-h" class="mb-3 text-sm font-bold text-ink">Shoppers by province</h2>
          <ul class="space-y-2">
            <li v-for="p in stats.customersByProvince" :key="p.province" class="grid grid-cols-[7.5rem_1fr_2.5rem] items-center gap-2 text-sm">
              <span class="truncate text-ink">{{ p.province }}</span>
              <span class="h-2 overflow-hidden rounded-full bg-cream" aria-hidden="true"><span class="block h-full rounded-full bg-hela-green" :style="{ width: `${(p.count / maxProvince) * 100}%` }" /></span>
              <span class="text-right font-semibold tabular-nums">{{ p.count }}</span>
            </li>
          </ul>
        </section>
      </div>
    </template>
  </div>
</template>
