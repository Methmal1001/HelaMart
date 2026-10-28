<script setup lang="ts">
import type { IconName } from '~/types'
import type { Permission } from '~/types/admin'

useHead({
  titleTemplate: (t) => (t ? `${t} · HelaMart Admin` : 'HelaMart Admin'),
  meta: [{ name: 'robots', content: 'noindex, nofollow' }],
})

const auth = useAdminAuth()
const route = useRoute()
const mobileOpen = ref(false)
watch(() => route.fullPath, () => (mobileOpen.value = false))

interface NavItem { to: string; label: string; icon: IconName; perm: Permission }
const NAV: { label: string; items: NavItem[] }[] = [
  {
    label: 'Store',
    items: [
      { to: '/admin', label: 'Dashboard', icon: 'grid', perm: 'dashboard.view' },
      { to: '/admin/orders', label: 'Orders', icon: 'receipt', perm: 'orders.view' },
      { to: '/admin/products', label: 'Products & stock', icon: 'package', perm: 'products.view' },
      { to: '/admin/categories', label: 'Categories', icon: 'list', perm: 'products.view' },
      { to: '/admin/customers', label: 'Customers', icon: 'users', perm: 'customers.view' },
      { to: '/admin/promotions', label: 'Promotions', icon: 'gift', perm: 'promotions.view' },
    ],
  },
  {
    label: 'Team',
    items: [
      { to: '/admin/tasks', label: 'Tasks', icon: 'clipboard', perm: 'tasks.view' },
      { to: '/admin/staff', label: 'Staff', icon: 'user', perm: 'staff.view' },
      { to: '/admin/roles', label: 'Roles & permissions', icon: 'key', perm: 'roles.manage' },
    ],
  },
  {
    label: 'System',
    items: [
      { to: '/admin/audit', label: 'Audit log', icon: 'history', perm: 'audit.view' },
      { to: '/admin/settings', label: 'Settings', icon: 'settings', perm: 'settings.manage' },
    ],
  },
]
const nav = computed(() => NAV.map((g) => ({ ...g, items: g.items.filter((i) => auth.can(i.perm)) })).filter((g) => g.items.length))
const isActive = (to: string) => (to === '/admin' ? route.path === '/admin' : route.path.startsWith(to))
</script>

<template>
  <div class="min-h-dvh bg-[#F4F5F1]">
    <!-- Sidebar -->
    <div v-if="mobileOpen" class="fixed inset-0 z-40 bg-ink/40 lg:hidden" aria-hidden="true" @click="mobileOpen = false" />
    <aside
      class="fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-hela-green text-white transition-transform lg:translate-x-0"
      :class="mobileOpen ? 'translate-x-0' : '-translate-x-full'"
      aria-label="Admin navigation"
    >
      <div class="flex items-center gap-3 px-5 py-5">
        <span class="grid size-10 place-items-center rounded-xl bg-hela-gold text-hela-green-900"><AppIcon name="shield" :size="20" /></span>
        <span class="leading-tight">
          <span class="block text-lg font-extrabold tracking-tight">HelaMart</span>
          <span class="block text-xs font-semibold text-hela-gold">Back office</span>
        </span>
      </div>
      <nav class="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        <div v-for="g in nav" :key="g.label" class="mt-4">
          <p class="px-3 pb-1.5 text-[0.65rem] font-bold tracking-[0.16em] text-white/50 uppercase">{{ g.label }}</p>
          <NuxtLink
            v-for="i in g.items"
            :key="i.to"
            :to="i.to"
            class="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition"
            :class="isActive(i.to) ? 'bg-white text-hela-green' : 'text-white/85 hover:bg-white/10 hover:text-white'"
            :aria-current="isActive(i.to) ? 'page' : undefined"
          >
            <AppIcon :name="i.icon" :size="18" />
            {{ i.label }}
          </NuxtLink>
        </div>
      </nav>
      <div v-if="auth.user.value" class="border-t border-white/10 p-3">
        <NuxtLink to="/admin/account" class="flex items-center gap-3 rounded-xl p-2 hover:bg-white/10">
          <UserAvatar :name="auth.user.value.name" :color="auth.user.value.avatarColor" :size="36" />
          <span class="min-w-0 leading-tight">
            <span class="block truncate text-sm font-semibold">{{ auth.user.value.name }}</span>
            <span class="block truncate text-xs text-hela-gold">{{ auth.user.value.roleName }}</span>
          </span>
        </NuxtLink>
        <button type="button" class="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-white/80 hover:bg-white/10 hover:text-white" @click="auth.logout('You signed out.')">
          <AppIcon name="logout" :size="17" />
          Sign out
        </button>
      </div>
    </aside>

    <!-- Main -->
    <div class="lg:pl-64">
      <header class="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-white/95 px-4 backdrop-blur sm:px-6">
        <button type="button" class="btn-icon size-9 lg:hidden" aria-label="Open navigation" :aria-expanded="mobileOpen" @click="mobileOpen = true">
          <AppIcon name="menu" :size="18" />
        </button>
        <span class="chip bg-hela-green-50 text-hela-green">
          <AppIcon name="lock" :size="12" />
          Secure session
        </span>
        <span v-if="auth.user.value" class="hidden text-xs text-muted sm:inline">Signed in as <b class="text-ink">{{ auth.user.value.roleName }}</b></span>
        <div class="ml-auto flex items-center gap-2">
          <a href="/" target="_blank" rel="noopener noreferrer" class="btn-ghost h-9 px-3 text-xs">
            <AppIcon name="store" :size="15" />
            <span class="hidden sm:inline">View store</span>
          </a>
          <NuxtLink v-if="auth.user.value" to="/admin/account" class="rounded-full" aria-label="My account">
            <UserAvatar :name="auth.user.value.name" :color="auth.user.value.avatarColor" :size="34" />
          </NuxtLink>
        </div>
      </header>
      <main class="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <slot />
      </main>
    </div>

    <AdminSecurityDialogs />
  </div>
</template>
