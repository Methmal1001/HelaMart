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

interface NavItem { to: string; label: string; icon: IconName; perm?: Permission }
const PLATFORM_NAV: { label: string; items: NavItem[] }[] = [
  { label: 'Overview', items: [{ to: '/admin', label: 'Platform dashboard', icon: 'grid', perm: 'platform.dashboard' }] },
  {
    label: 'Supermarkets',
    items: [
      { to: '/admin/supermarkets', label: 'Supermarkets', icon: 'store', perm: 'tenants.view' },
      { to: '/admin/supermarket-admins', label: 'Supermarket admins', icon: 'shield', perm: 'tenants.view' },
      { to: '/admin/branding-approvals', label: 'Branding approvals', icon: 'sparkle', perm: 'tenants.view' },
      { to: '/admin/customers', label: 'Customers (all Sri Lanka)', icon: 'users', perm: 'customers.all.view' },
    ],
  },
  {
    label: 'HelaMart team',
    items: [
      { to: '/admin/tasks', label: 'Tasks', icon: 'clipboard' },
      { to: '/admin/staff', label: 'Head-office team', icon: 'user', perm: 'platform.staff.manage' },
      { to: '/admin/roles', label: 'Platform roles', icon: 'key', perm: 'platform.roles.manage' },
    ],
  },
  {
    label: 'System',
    items: [
      { to: '/admin/audit', label: 'Audit log', icon: 'history', perm: 'platform.audit.view' },
      { to: '/admin/settings', label: 'Platform settings', icon: 'settings', perm: 'platform.settings.manage' },
    ],
  },
]
const TENANT_NAV: { label: string; items: NavItem[] }[] = [
  {
    label: 'Store',
    items: [
      { to: '/admin', label: 'Dashboard', icon: 'grid', perm: 'dashboard.view' },
      { to: '/admin/branches', label: 'Branches', icon: 'store', perm: 'branches.view' },
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
      { to: '/admin/staff', label: 'Officers & staff', icon: 'user', perm: 'staff.view' },
      { to: '/admin/roles', label: 'Roles & permissions', icon: 'key', perm: 'roles.manage' },
    ],
  },
  {
    label: 'Records',
    items: [
      { to: '/admin/audit', label: 'Audit log', icon: 'history', perm: 'audit.view' },
      { to: '/admin/branding', label: 'Store branding', icon: 'sparkle', perm: 'settings.manage' },
      { to: '/admin/settings', label: 'Supermarket settings', icon: 'settings', perm: 'settings.manage' },
    ],
  },
]
const nav = computed(() =>
  (auth.isPlatform.value ? PLATFORM_NAV : TENANT_NAV)
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.perm || auth.can(i.perm)) }))
    .filter((g) => g.items.length),
)
const isActive = (to: string) => (to === '/admin' ? route.path === '/admin' : route.path.startsWith(to))
const orgLabel = computed(() => {
  const u = auth.user.value
  if (!u) return ''
  if (!u.tenantId) return 'HelaMart head office'
  return u.branchNames.length ? `${u.tenantName} · ${u.branchNames.join(', ')}` : `${u.tenantName} · All branches`
})
</script>

<template>
  <div class="min-h-dvh bg-[#F4F5F1]">
    <div v-if="mobileOpen" class="fixed inset-0 z-40 bg-ink/40 lg:hidden" aria-hidden="true" @click="mobileOpen = false" />
    <aside
      class="fixed inset-y-0 left-0 z-50 flex w-64 flex-col text-white transition-transform lg:translate-x-0"
      :class="[mobileOpen ? 'translate-x-0' : '-translate-x-full', auth.isPlatform.value ? 'bg-ink' : 'bg-hela-green']"
      aria-label="Admin navigation"
    >
      <div class="flex items-center gap-3 px-5 pt-5 pb-3">
        <span class="grid size-10 place-items-center rounded-xl bg-hela-gold text-hela-green-900"><AppIcon :name="auth.isPlatform.value ? 'shield' : 'store'" :size="20" /></span>
        <span class="min-w-0 leading-tight">
          <span class="block truncate text-lg font-extrabold tracking-tight">{{ auth.isPlatform.value ? 'HelaMart' : auth.user.value?.tenantName }}</span>
          <span class="block text-xs font-semibold text-hela-gold">{{ auth.isPlatform.value ? 'Platform control' : 'Supermarket portal' }}</span>
        </span>
      </div>
      <p v-if="!auth.isPlatform.value && auth.user.value" class="mx-5 mb-1 truncate rounded-lg bg-white/10 px-2.5 py-1.5 text-xs text-white/85">
        <AppIcon name="pin" :size="12" class="mr-1 inline align-[-1px]" />{{ auth.user.value.branchNames.length ? auth.user.value.branchNames.join(', ') : 'All branches' }}
      </p>
      <nav class="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        <div v-for="g in nav" :key="g.label" class="mt-4">
          <p class="px-3 pb-1.5 text-[0.65rem] font-bold tracking-[0.16em] text-white/50 uppercase">{{ g.label }}</p>
          <NuxtLink
            v-for="i in g.items"
            :key="i.to"
            :to="i.to"
            class="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition"
            :class="isActive(i.to) ? 'bg-white text-ink' : 'text-white/85 hover:bg-white/10 hover:text-white'"
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

    <div class="lg:pl-64">
      <header class="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-white/95 px-4 backdrop-blur sm:px-6">
        <button type="button" class="btn-icon size-9 lg:hidden" aria-label="Open navigation" :aria-expanded="mobileOpen" @click="mobileOpen = true">
          <AppIcon name="menu" :size="18" />
        </button>
        <span class="chip bg-hela-green-50 text-hela-green"><AppIcon name="lock" :size="12" />Secure session</span>
        <span v-if="auth.user.value" class="hidden min-w-0 truncate text-xs text-muted sm:inline"><b class="text-ink">{{ auth.user.value.roleName }}</b> · {{ orgLabel }}</span>
        <div class="ml-auto flex items-center gap-2">
          <a href="/" target="_blank" rel="noopener noreferrer" class="btn-ghost h-9 px-3 text-xs"><AppIcon name="store" :size="15" /><span class="hidden sm:inline">View storefront</span></a>
          <NuxtLink v-if="auth.user.value" to="/admin/account" class="rounded-full" aria-label="My account">
            <UserAvatar :name="auth.user.value.name" :color="auth.user.value.avatarColor" :size="34" />
          </NuxtLink>
        </div>
      </header>
      <div v-if="auth.readOnly.value" class="flex gap-2 border-b border-[#f0d9a8] bg-[#FFF4D6] px-6 py-2.5 text-sm text-[#7A5600]" role="alert">
        <AppIcon name="alert" :size="17" class="mt-0.5 shrink-0" />
        <span><b>{{ auth.user.value?.tenantName }} is restricted by HelaMart.</b> {{ auth.user.value?.tenantStatusReason }} You can view your data, but changes are disabled and shoppers can’t see your stores until the restriction is lifted.</span>
      </div>
      <main class="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <slot />
      </main>
    </div>

    <AdminSecurityDialogs />
  </div>
</template>
