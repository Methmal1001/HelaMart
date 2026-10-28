<script setup lang="ts">
import type { Permission, Role, StaffView, TableColumn } from '~/types/admin'
import { ROLE_IDS } from '~/data/admin/permissions'
import { createStaff, listRoles, listStaff, resetStaffPassword, revokeStaffSessions, setStaffStatus, updateStaff, type StaffInput } from '~/services/admin/api'

definePageMeta({ layout: 'admin', middleware: 'admin', permission: 'staff.view' })
useHead({ title: 'Staff' })

const auth = useAdminAuth()
const notify = useAdminNotify()
const { confirm } = useAdminConfirm()
const staff = ref<StaffView[]>([])
const roles = ref<(Role & { members: number })[]>([])
const loading = ref(true)
const canManage = computed(() => auth.can('staff.manage'))

async function load() {
  loading.value = true
  try {
    ;[staff.value, roles.value] = await Promise.all([auth.call(listStaff), auth.call(listRoles)])
  } catch (e) {
    notify.error(e)
  } finally {
    loading.value = false
  }
}
onMounted(load)

const me = computed(() => auth.user.value)
const myRole = computed(() => roles.value.find((r) => r.id === me.value?.roleId))
const iAmSuper = computed(() => me.value?.roleId === ROLE_IDS.superAdmin)
const levelOf = (roleId: string) => roles.value.find((r) => r.id === roleId)?.level ?? 0
/** Mirrors the server's hierarchy rules so we only offer actions that will succeed. */
const manageable = (s: StaffView) => canManage.value && s.id !== me.value?.id && (iAmSuper.value || levelOf(s.roleId) < (myRole.value?.level ?? 0))
const assignableRoles = computed(() =>
  roles.value.filter((r) => (r.id === ROLE_IDS.superAdmin ? iAmSuper.value : iAmSuper.value || r.level < (myRole.value?.level ?? 0)) && r.permissions.every((p) => auth.can(p))),
)

const columns: TableColumn[] = [
  { key: 'name', label: 'Staff member', sortable: true, value: (s: StaffView) => `${s.name} ${s.email} ${s.title}` },
  { key: 'roleName', label: 'Role', sortable: true },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'lastLoginAt', label: 'Last sign-in', sortable: true, value: (s: StaffView) => s.lastLoginAt ?? '' },
  { key: 'activeSessions', label: 'Sessions', align: 'right' },
  { key: 'actions', label: '', align: 'right', value: () => '' },
]
const when = (iso?: string) => (iso ? new Date(iso).toLocaleString('en-LK', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : 'Never')

// ---- editor
const editing = ref<StaffView | 'new' | null>(null)
const f = reactive<StaffInput>({ name: '', email: '', phone: '', title: '', roleId: '', extraPermissions: [] })
const error = ref('')
const saving = ref(false)
const selectedRole = computed(() => roles.value.find((r) => r.id === f.roleId))

function open(s: StaffView | 'new') {
  editing.value = s
  error.value = ''
  if (s === 'new') Object.assign(f, { name: '', email: '', phone: '', title: '', roleId: assignableRoles.value.at(-1)?.id ?? '', extraPermissions: [] })
  else Object.assign(f, { name: s.name, email: s.email, phone: s.phone ?? '', title: s.title, roleId: s.roleId, extraPermissions: [...s.extraPermissions] })
}
// Extra grants that are already in the role are redundant.
watch(() => f.roleId, () => (f.extraPermissions = f.extraPermissions.filter((p) => !selectedRole.value?.permissions.includes(p))))

const secret = ref<{ name: string; email: string; password: string; title: string } | null>(null)

async function save() {
  error.value = ''
  saving.value = true
  try {
    if (editing.value === 'new') {
      const r = await auth.call((t) => createStaff(t, { ...f }), 'Adding staff needs your password confirmed.')
      staff.value = [...staff.value, r.staff]
      secret.value = { name: r.staff.name, email: r.staff.email, password: r.tempPassword, title: 'Staff account created' }
    } else if (editing.value) {
      const id = editing.value.id
      const u = await auth.call((t) => updateStaff(t, id, { ...f }), 'Changing access needs your password confirmed.')
      staff.value = staff.value.map((x) => (x.id === u.id ? u : x))
      notify.ok(`${u.name} updated — they’ll sign in again with the new access`)
    }
    editing.value = null
    roles.value = await auth.call(listRoles)
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    saving.value = false
  }
}

async function resetPassword(s: StaffView) {
  const r = await confirm({ title: `Reset ${s.name}’s password?`, message: 'A temporary password is issued and all their sessions end. They must choose a new password at next sign-in.', confirmLabel: 'Reset password', tone: 'danger' })
  if (!r.ok) return
  try {
    const out = await auth.call((t) => resetStaffPassword(t, s.id), 'Resetting passwords needs your password confirmed.')
    secret.value = { name: s.name, email: s.email, password: out.tempPassword, title: 'Temporary password issued' }
    await load()
  } catch (e) {
    notify.error(e)
  }
}

async function signOut(s: StaffView) {
  try {
    await auth.call((t) => revokeStaffSessions(t, s.id))
    notify.ok(`${s.name} signed out of all devices`)
    await load()
  } catch (e) {
    notify.error(e)
  }
}

async function toggleStatus(s: StaffView) {
  const suspend = s.status === 'active'
  const r = await confirm({
    title: suspend ? `Suspend ${s.name}?` : `Reactivate ${s.name}?`,
    message: suspend ? 'They are signed out immediately and can’t sign in until reactivated. Their history is kept.' : 'They will be able to sign in again with their existing password.',
    confirmLabel: suspend ? 'Suspend account' : 'Reactivate',
    tone: suspend ? 'danger' : 'default',
    reasonLabel: suspend ? 'Reason' : undefined,
  })
  if (!r.ok) return
  try {
    const u = await auth.call((t) => setStaffStatus(t, s.id, suspend ? 'suspended' : 'active', r.reason), 'Changing account status needs your password confirmed.')
    staff.value = staff.value.map((x) => (x.id === u.id ? u : x))
    notify.ok(suspend ? `${u.name} suspended` : `${u.name} reactivated`)
  } catch (e) {
    notify.error(e)
  }
}
</script>

<template>
  <div>
    <AdminPageHeader title="Staff" description="Add managers and team members, set their role and any extra permissions.">
      <button v-if="canManage" type="button" class="btn-primary h-10" @click="open('new')"><AppIcon name="plus" :size="17" />Add staff member</button>
    </AdminPageHeader>

    <AdminDataTable :rows="staff" :columns="columns" row-key="id" :loading="loading" search-placeholder="Search name, email or job title…" :initial-sort="{ key: 'name', dir: 'asc' }">
      <template #cell-name="{ row }">
        <div class="flex items-center gap-2.5">
          <UserAvatar :name="row.name" :color="row.avatarColor" :size="32" />
          <span class="min-w-0">
            <span class="block font-semibold text-ink">{{ row.name }} <span v-if="row.id === me?.id" class="text-xs font-normal text-muted">(you)</span></span>
            <span class="block truncate text-xs text-muted">{{ row.title }} · {{ row.email }}</span>
          </span>
        </div>
      </template>
      <template #cell-roleName="{ row }">
        <span class="font-semibold text-ink">{{ row.roleName }}</span>
        <span v-if="row.extraPermissions.length" class="block text-xs text-hela-gold-600">+{{ row.extraPermissions.length }} extra</span>
      </template>
      <template #cell-status="{ row }">
        <AdminBadge :value="row.status" />
        <span v-if="row.mustChangePassword" class="ml-1 text-xs text-muted">password pending</span>
      </template>
      <template #cell-lastLoginAt="{ row }"><span class="text-xs text-muted">{{ when(row.lastLoginAt) }}</span></template>
      <template #cell-activeSessions="{ row }"><span class="tabular-nums">{{ row.activeSessions }}</span></template>
      <template #cell-actions="{ row }">
        <div v-if="manageable(row)" class="flex justify-end gap-1">
          <button type="button" class="btn-ghost h-8 px-2.5 text-xs" :aria-label="`Edit ${row.name}`" @click="open(row)"><AppIcon name="edit" :size="14" />Edit</button>
          <button type="button" class="btn-ghost h-8 px-2.5 text-xs" :aria-label="`Reset password for ${row.name}`" title="Reset password" @click="resetPassword(row)"><AppIcon name="key" :size="14" /></button>
          <button type="button" class="btn-ghost h-8 px-2.5 text-xs" :aria-label="`Sign ${row.name} out everywhere`" title="Sign out everywhere" :disabled="!row.activeSessions" @click="signOut(row)"><AppIcon name="logout" :size="14" /></button>
          <button type="button" class="btn-ghost h-8 px-2.5 text-xs" :class="row.status === 'active' ? 'text-[#8A2E2E]' : ''" @click="toggleStatus(row)">{{ row.status === 'active' ? 'Suspend' : 'Reactivate' }}</button>
        </div>
        <span v-else-if="canManage && row.id !== me?.id" class="text-xs text-muted" title="Only someone more senior can manage this account">Senior</span>
      </template>
    </AdminDataTable>

    <AdminModal :open="!!editing" :title="editing === 'new' ? 'Add staff member' : `Edit ${f.name}`" size="xl" @close="editing = null">
      <form id="staff-form" class="grid gap-4 lg:grid-cols-[18rem_1fr]" @submit.prevent="save">
        <div class="space-y-3">
          <label class="block"><span class="field-label">Full name</span><input v-model="f.name" class="field" maxlength="80" data-autofocus></label>
          <label class="block"><span class="field-label">Work email</span><input v-model="f.email" type="email" class="field" maxlength="120"></label>
          <label class="block"><span class="field-label">Mobile (optional)</span><input v-model="f.phone" type="tel" class="field" placeholder="077 123 4567"></label>
          <label class="block"><span class="field-label">Job title</span><input v-model="f.title" class="field" maxlength="80" placeholder="e.g. Store Manager — Kandy"></label>
          <label class="block"><span class="field-label">Role</span>
            <select v-model="f.roleId" class="field">
              <option v-for="r in assignableRoles" :key="r.id" :value="r.id">{{ r.name }}</option>
            </select>
          </label>
          <p v-if="selectedRole" class="rounded-lg bg-white p-3 text-xs text-muted ring-1 ring-line">{{ selectedRole.description }}</p>
          <p v-if="editing === 'new'" class="flex gap-2 rounded-lg bg-hela-gold-100/70 p-3 text-xs text-[#6d5622]">
            <AppIcon name="key" :size="15" class="shrink-0" />A one-time temporary password is generated. They must change it and use two-factor codes at first sign-in.
          </p>
          <p v-if="error" class="text-sm text-[#8A2E2E]" role="alert">{{ error }}</p>
        </div>
        <div>
          <p class="field-label">Permissions</p>
          <p class="mb-2 text-xs text-muted">Ticked and greyed = included in the role. Tick more to grant extra permissions to this person only. You can only grant permissions you have.</p>
          <PermissionMatrix v-model="f.extraPermissions" :grantable="auth.permissions.value" :locked="selectedRole?.permissions as Permission[] | undefined" />
        </div>
      </form>
      <template #footer>
        <button type="button" class="btn-ghost h-9" @click="editing = null">Cancel</button>
        <button type="submit" form="staff-form" class="btn-primary h-9" :disabled="saving">{{ saving ? 'Saving…' : editing === 'new' ? 'Create account' : 'Save changes' }}</button>
      </template>
    </AdminModal>

    <SecretRevealDialog :open="!!secret" :title="secret?.title ?? ''" :name="secret?.name ?? ''" :email="secret?.email ?? ''" :secret="secret?.password ?? ''" @close="secret = null" />
  </div>
</template>
