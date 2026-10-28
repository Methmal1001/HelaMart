<script setup lang="ts">
import type { StaffView, TableColumn } from '~/types/admin'
import { listChainAdmins, resetChainAdminPassword, setChainAdminStatus } from '~/services/admin/platformApi'

definePageMeta({ layout: 'admin', middleware: 'admin', scope: 'platform', permission: 'tenants.view' })
useHead({ title: 'Supermarket admins' })

const auth = useAdminAuth()
const notify = useAdminNotify()
const { confirm } = useAdminConfirm()
const admins = ref<StaffView[]>([])
const loading = ref(true)
const secret = ref<{ name: string; email: string; password: string } | null>(null)

async function load() {
  loading.value = true
  try {
    admins.value = await auth.call(listChainAdmins)
  } catch (e) {
    notify.error(e)
  } finally {
    loading.value = false
  }
}
onMounted(load)

const columns: TableColumn[] = [
  { key: 'name', label: 'Admin', sortable: true, value: (s: StaffView) => `${s.name} ${s.email}` },
  { key: 'tenantName', label: 'Supermarket', sortable: true, value: (s: StaffView) => s.tenantName ?? '' },
  { key: 'tenantStatus', label: 'Supermarket status', value: (s: StaffView) => s.tenantStatus ?? '' },
  { key: 'status', label: 'Account', sortable: true },
  { key: 'lastLoginAt', label: 'Last sign-in', sortable: true, value: (s: StaffView) => s.lastLoginAt ?? '' },
  { key: 'actions', label: '', align: 'right', value: () => '' },
]
const when = (iso?: string) => (iso ? new Date(iso).toLocaleString('en-LK', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : 'Never')

async function toggle(a: StaffView) {
  const active = a.status === 'active'
  const r = await confirm({ title: active ? `Suspend ${a.name}?` : `Reactivate ${a.name}?`, message: active ? `They are signed out of ${a.tenantName} and can’t sign in until reactivated.` : 'They can sign in again.', confirmLabel: active ? 'Suspend' : 'Reactivate', tone: active ? 'danger' : 'default', reasonLabel: active ? 'Reason' : undefined })
  if (!r.ok) return
  try {
    await auth.call((t) => setChainAdminStatus(t, a.id, active ? 'suspended' : 'active', r.reason), 'Changing an admin’s access needs your password confirmed.')
    notify.ok(active ? `${a.name} suspended` : `${a.name} reactivated`)
    await load()
  } catch (e) {
    notify.error(e)
  }
}
async function reset(a: StaffView) {
  const r = await confirm({ title: `Reset ${a.name}’s password?`, message: 'A temporary password is issued and their sessions end.', confirmLabel: 'Reset password', tone: 'danger' })
  if (!r.ok) return
  try {
    const out = await auth.call((t) => resetChainAdminPassword(t, a.id), 'Resetting passwords needs your password confirmed.')
    secret.value = { name: a.name, email: a.email, password: out.tempPassword }
    await load()
  } catch (e) {
    notify.error(e)
  }
}
</script>

<template>
  <div>
    <AdminPageHeader title="Supermarket admins" description="Heads of every supermarket chain on HelaMart. Add new admins from a supermarket’s page." />
    <AdminDataTable :rows="admins" :columns="columns" row-key="id" :loading="loading" search-placeholder="Search admin or supermarket…" :initial-sort="{ key: 'tenantName', dir: 'asc' }">
      <template #cell-name="{ row }">
        <div class="flex items-center gap-2.5"><UserAvatar :name="row.name" :color="row.avatarColor" :size="30" /><span class="min-w-0"><span class="block font-semibold text-ink">{{ row.name }}</span><span class="block truncate text-xs text-muted">{{ row.email }}</span></span></div>
      </template>
      <template #cell-tenantName="{ row }"><NuxtLink :to="`/admin/supermarkets?open=${row.tenantId}`" class="font-semibold text-ink hover:text-hela-green">{{ row.tenantName }}</NuxtLink></template>
      <template #cell-tenantStatus="{ row }"><AdminBadge :value="row.tenantStatus ?? 'pending'" /></template>
      <template #cell-status="{ row }"><AdminBadge :value="row.status" /><span v-if="row.mustChangePassword" class="ml-1 text-xs text-muted">password pending</span></template>
      <template #cell-lastLoginAt="{ row }"><span class="text-xs text-muted">{{ when(row.lastLoginAt) }}</span></template>
      <template #cell-actions="{ row }">
        <div v-if="auth.can('tenant_admins.manage')" class="flex justify-end gap-1">
          <button type="button" class="btn-ghost h-8 px-2.5 text-xs" :aria-label="`Reset password for ${row.name}`" title="Reset password" @click="reset(row)"><AppIcon name="key" :size="14" /></button>
          <button type="button" class="btn-ghost h-8 px-2.5 text-xs" :class="row.status === 'active' ? 'text-[#8A2E2E]' : ''" @click="toggle(row)">{{ row.status === 'active' ? 'Suspend' : 'Reactivate' }}</button>
        </div>
      </template>
    </AdminDataTable>
    <SecretRevealDialog :open="!!secret" title="Temporary password issued" :name="secret?.name ?? ''" :email="secret?.email ?? ''" :secret="secret?.password ?? ''" @close="secret = null" />
  </div>
</template>
