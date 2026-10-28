<script setup lang="ts">
import type { Permission, Role } from '~/types/admin'
import { ALL_PERMISSIONS, ROLE_IDS, permissionLabel } from '~/data/admin/permissions'
import { deleteRole, listRoles, saveRole, type RoleInput } from '~/services/admin/api'

definePageMeta({ layout: 'admin', middleware: 'admin', permission: 'roles.manage' })
useHead({ title: 'Roles & permissions' })

const auth = useAdminAuth()
const notify = useAdminNotify()
const { confirm } = useAdminConfirm()
const roles = ref<(Role & { members: number })[]>([])

async function load() {
  try {
    roles.value = await auth.call(listRoles)
  } catch (e) {
    notify.error(e)
  }
}
onMounted(load)

const iAmSuper = computed(() => auth.user.value?.roleId === ROLE_IDS.superAdmin)
const myLevel = computed(() => roles.value.find((r) => r.id === auth.user.value?.roleId)?.level ?? 0)
const editable = (r: Role) => !r.system && (iAmSuper.value || r.level < myLevel.value)
const maxLevel = computed(() => (iAmSuper.value ? 79 : Math.min(79, myLevel.value - 1)))

const editing = ref<Role | 'new' | null>(null)
const f = reactive<RoleInput>({ name: '', description: '', permissions: [], level: 20 })
const error = ref('')
const viewing = ref<Role | null>(null)

function open(r: Role | 'new') {
  editing.value = r
  error.value = ''
  Object.assign(f, r === 'new' ? { name: '', description: '', permissions: ['dashboard.view', 'tasks.view'], level: Math.min(20, maxLevel.value) } : { name: r.name, description: r.description, permissions: [...r.permissions], level: r.level })
}

async function save() {
  error.value = ''
  const id = editing.value === 'new' ? undefined : editing.value?.id
  try {
    const r = await auth.call((t) => saveRole(t, { ...f, level: Number(f.level) }, id), 'Changing roles needs your password confirmed.')
    notify.ok(`${r.name} saved${id ? ' — members will sign in again with the new access' : ''}`)
    editing.value = null
    await load()
  } catch (e) {
    error.value = (e as Error).message
  }
}

async function remove(r: Role & { members: number }) {
  const ok = await confirm({ title: `Delete the ${r.name} role?`, message: r.members ? `${r.members} staff still have this role — move them first.` : 'This cannot be undone.', confirmLabel: 'Delete role', tone: 'danger' })
  if (!ok.ok) return
  try {
    await auth.call((t) => deleteRole(t, r.id), 'Deleting roles needs your password confirmed.')
    notify.ok(`${r.name} deleted`)
    await load()
  } catch (e) {
    notify.error(e)
  }
}
</script>

<template>
  <div>
    <AdminPageHeader title="Roles & permissions" description="Roles bundle permissions. Create roles such as Store Manager or Cashier, then assign them to staff.">
      <button type="button" class="btn-primary h-10" @click="open('new')"><AppIcon name="plus" :size="17" />New role</button>
    </AdminPageHeader>

    <div class="mb-4 flex gap-2 rounded-xl bg-white p-3 text-xs text-muted ring-1 ring-line">
      <AppIcon name="shield" :size="16" class="shrink-0 text-hela-green" />
      <span><b class="text-ink">Seniority</b> decides who can manage whom: you can only edit roles and staff below your own level, and only grant permissions you hold. Built-in roles can’t be changed.</span>
    </div>

    <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      <article v-for="r in roles" :key="r.id" class="card flex flex-col p-4">
        <div class="flex items-start justify-between gap-2">
          <div>
            <h2 class="flex items-center gap-2 font-bold text-ink">
              {{ r.name }}
              <span v-if="r.system" class="chip bg-hela-green text-hela-gold">Built-in</span>
            </h2>
            <p class="text-xs text-muted">Level {{ r.level }} · {{ r.members }} {{ r.members === 1 ? 'member' : 'members' }}</p>
          </div>
          <span class="text-right text-xs font-semibold text-hela-green">{{ r.permissions.length }}/{{ ALL_PERMISSIONS.length }}<br>permissions</span>
        </div>
        <p class="mt-2 flex-1 text-sm text-muted">{{ r.description }}</p>
        <div class="mt-3 flex gap-2">
          <button type="button" class="btn-ghost h-8 px-3 text-xs" @click="viewing = r"><AppIcon name="eye" :size="14" />View</button>
          <template v-if="editable(r)">
            <button type="button" class="btn-ghost h-8 px-3 text-xs" @click="open(r)"><AppIcon name="edit" :size="14" />Edit</button>
            <button type="button" class="btn-ghost h-8 px-3 text-xs text-[#8A2E2E]" :aria-label="`Delete ${r.name}`" @click="remove(r)"><AppIcon name="trash" :size="14" /></button>
          </template>
        </div>
      </article>
    </div>

    <AdminModal :open="!!viewing" :title="viewing?.name ?? ''" :description="viewing?.description" @close="viewing = null">
      <ul v-if="viewing" class="grid gap-1.5 text-sm sm:grid-cols-2">
        <li v-for="p in viewing.permissions" :key="p" class="flex items-center gap-2"><AppIcon name="check" :size="14" class="text-hela-green" />{{ permissionLabel(p) }}</li>
      </ul>
    </AdminModal>

    <AdminModal :open="!!editing" :title="editing === 'new' ? 'New role' : `Edit ${f.name}`" size="xl" @close="editing = null">
      <form id="role-form" class="grid gap-4 lg:grid-cols-[18rem_1fr]" @submit.prevent="save">
        <div class="space-y-3">
          <label class="block"><span class="field-label">Role name</span><input v-model="f.name" class="field" maxlength="40" placeholder="e.g. Cashier" data-autofocus></label>
          <label class="block"><span class="field-label">Description</span><textarea v-model="f.description" rows="3" maxlength="200" class="field h-auto py-2" /></label>
          <label class="block">
            <span class="field-label">Seniority level (1–{{ maxLevel }})</span>
            <input v-model.number="f.level" type="number" min="1" :max="maxLevel" class="field">
            <span class="mt-1 block text-xs text-muted">Higher levels can manage lower ones. Admin is 80, Super Admin 100.</span>
          </label>
          <p class="text-xs font-semibold text-ink">{{ f.permissions.length }} permissions selected</p>
          <p v-if="error" class="text-sm text-[#8A2E2E]" role="alert">{{ error }}</p>
        </div>
        <PermissionMatrix v-model="f.permissions" :grantable="auth.permissions.value" />
      </form>
      <template #footer>
        <button type="button" class="btn-ghost h-9" @click="editing = null">Cancel</button>
        <button type="submit" form="role-form" class="btn-primary h-9">Save role</button>
      </template>
    </AdminModal>
  </div>
</template>
