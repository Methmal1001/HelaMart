<script setup lang="ts">
import type { Role } from '~/types/admin'
import type { Permission } from '~/types/admin'
import { CHAIN_ONLY_PERMISSIONS, ROLE_IDS, permissionLabel, permissionsFor } from '~/data/admin/permissions'
import { deleteTeamRole, getBranchManagerAccess, listTeamRoles, saveTeamRole, setBranchManagerAccess, type RoleInput } from '~/services/admin/common'

definePageMeta({ layout: 'admin', middleware: 'admin', permission: { platform: 'platform.roles.manage', tenant: 'roles.manage' } })
useHead({ title: 'Roles & permissions' })

const auth = useAdminAuth()
const notify = useAdminNotify()
const { confirm } = useAdminConfirm()
const roles = ref<(Role & { members: number })[]>([])
const scope = computed(() => (auth.isPlatform.value ? 'platform' : 'tenant') as 'platform' | 'tenant')
const total = computed(() => permissionsFor(scope.value).length)

async function load() {
  try {
    roles.value = await auth.call(listTeamRoles)
    if (scope.value === 'tenant') bm.value = await auth.call(getBranchManagerAccess)
  } catch (e) {
    notify.error(e)
  }
}
onMounted(load)

// ---- what this supermarket's branch managers can do (at their own branches)
const bm = ref<Awaited<ReturnType<typeof getBranchManagerAccess>> | null>(null)
const bmEditing = ref(false)
const bmDraft = ref<Permission[]>([])
const canSetBranchManagers = computed(() => scope.value === 'tenant' && auth.can('roles.manage') && auth.isChainLevel.value && !auth.readOnly.value)
/** Headline capabilities for the summary card. */
const BM_HIGHLIGHTS: { perm: Permission; label: string }[] = [
  { perm: 'products.manage', label: 'Branch products & prices' },
  { perm: 'inventory.manage', label: 'Stock' },
  { perm: 'promotions.manage', label: 'Branch offers' },
  { perm: 'workflow.manage', label: 'Order workflow' },
  { perm: 'orders.manage', label: 'Supervise orders' },
  { perm: 'branches.manage', label: 'Branch details' },
  { perm: 'staff.manage', label: 'Officers' },
  { perm: 'customers.manage', label: 'Block customers' },
]
const bmCount = computed(() => bmDraft.value.filter((p) => !(CHAIN_ONLY_PERMISSIONS as Permission[]).includes(p)).length)
function editBranchManagers() {
  bmDraft.value = [...(bm.value?.permissions ?? [])]
  bmEditing.value = true
}
async function saveBranchManagers(standard = false) {
  try {
    await auth.call((t) => setBranchManagerAccess(t, standard ? null : bmDraft.value), 'Changing what branch managers can do needs your password confirmed.')
    notify.ok(standard ? 'Branch managers are back to the standard permissions' : 'Branch manager permissions saved — they apply straight away')
    bmEditing.value = false
    await load()
  } catch (e) {
    notify.error(e)
  }
}

const iAmSuper = computed(() => auth.user.value?.roleId === ROLE_IDS.superAdmin)
const myLevel = computed(() => auth.user.value?.roleLevel ?? 0)
const editable = (r: Role) => !r.system && r.tenantId === (auth.user.value?.tenantId ?? null) && (iAmSuper.value || r.level < myLevel.value) && !auth.readOnly.value
const maxLevel = computed(() => (iAmSuper.value ? 99 : Math.min(scope.value === 'platform' ? 99 : 79, myLevel.value - 1)))

const editing = ref<Role | 'new' | null>(null)
const f = reactive<RoleInput>({ name: '', description: '', permissions: [], level: 20, branchScoped: true })
const error = ref('')
const viewing = ref<Role | null>(null)

function open(r: Role | 'new') {
  editing.value = r
  error.value = ''
  Object.assign(
    f,
    r === 'new'
      ? { name: '', description: '', permissions: scope.value === 'tenant' ? ['dashboard.view', 'tasks.view'] : ['platform.dashboard'], level: Math.min(20, maxLevel.value), branchScoped: scope.value === 'tenant' }
      : { name: r.name, description: r.description, permissions: [...r.permissions], level: r.level, branchScoped: r.branchScoped },
  )
}

async function save() {
  error.value = ''
  const id = editing.value === 'new' ? undefined : editing.value?.id
  try {
    const r = await auth.call((t) => saveTeamRole(t, { ...f, level: Number(f.level) }, id), 'Changing roles needs your password confirmed.')
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
    await auth.call((t) => deleteTeamRole(t, r.id), 'Deleting roles needs your password confirmed.')
    notify.ok(`${r.name} deleted`)
    await load()
  } catch (e) {
    notify.error(e)
  }
}
</script>

<template>
  <div>
    <AdminPageHeader :title="scope === 'tenant' ? 'Roles & permissions' : 'Platform roles'" :description="scope === 'tenant' ? 'Create roles such as Cashier, Stock Officer or Floor Supervisor and choose exactly what each can do.' : 'Roles for the HelaMart head-office team.'">
      <button v-if="!auth.readOnly.value" type="button" class="btn-primary h-10" @click="open('new')"><AppIcon name="plus" :size="17" />New role</button>
    </AdminPageHeader>

    <div class="mb-4 flex gap-2 rounded-xl bg-white p-3 text-xs text-muted ring-1 ring-line">
      <AppIcon name="shield" :size="16" class="shrink-0 text-hela-green" />
      <span><b class="text-ink">Seniority</b> decides who can manage whom: you can only edit roles and people below your level, and only grant permissions you hold. Built-in roles (Chain Admin, Branch Manager{{ scope === 'platform' ? ', Super Admin' : '' }}) can’t be renamed or deleted{{ scope === 'tenant' ? ' — but you choose what your branch managers can do above' : '' }}. <b class="text-ink">Branch roles</b> are tied to specific branches.</span>
    </div>

    <!-- Branch managers -->
    <section v-if="bm" class="card mb-4 p-4" data-testid="bm-access">
      <div class="flex flex-wrap items-start gap-3">
        <span class="grid size-10 shrink-0 place-items-center rounded-xl bg-hela-green text-hela-gold"><AppIcon name="store" :size="19" /></span>
        <div class="min-w-0 flex-1">
          <h2 class="flex flex-wrap items-center gap-2 font-bold text-ink">
            What branch managers can do
            <span class="chip" :class="bm.customised ? 'bg-hela-gold-100 text-[#6d5622]' : 'bg-cream text-ink'">{{ bm.customised ? 'Customised' : 'Standard' }}</span>
          </h2>
          <p class="text-sm text-muted">Applies to all {{ bm.managers }} branch manager{{ bm.managers === 1 ? '' : 's' }}, always limited to their own branch. Supermarket settings, branding, roles and categories stay with you. For one person only, add extra permissions under Officers &amp; staff.</p>
          <ul class="mt-2 flex flex-wrap gap-1.5" data-testid="bm-highlights">
            <li v-for="h in BM_HIGHLIGHTS" :key="h.perm" class="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold" :class="bm.permissions.includes(h.perm) ? 'bg-hela-green-50 text-hela-green' : 'bg-cream text-muted line-through'">
              <AppIcon :name="bm.permissions.includes(h.perm) ? 'check' : 'close'" :size="11" />{{ h.label }}
            </li>
          </ul>
        </div>
        <button v-if="canSetBranchManagers" type="button" class="btn-primary h-9 text-sm" data-testid="bm-edit" @click="editBranchManagers"><AppIcon name="edit" :size="14" />Change</button>
      </div>
    </section>

    <AdminModal :open="bmEditing" title="What branch managers can do" description="Everything here works only at each manager’s own branch." size="xl" @close="bmEditing = false">
      <PermissionMatrix v-model="bmDraft" scope="tenant" :grantable="auth.permissions.value" :chain-only="CHAIN_ONLY_PERMISSIONS" />
      <template #footer>
        <button type="button" class="btn-ghost mr-auto h-9" data-testid="bm-standard" @click="saveBranchManagers(true)">Use the standard set</button>
        <span class="text-xs text-muted">{{ bmCount }} permissions</span>
        <button type="button" class="btn-ghost h-9" @click="bmEditing = false">Cancel</button>
        <button type="button" class="btn-primary h-9" data-testid="bm-save" @click="saveBranchManagers()">Save for all branch managers</button>
      </template>
    </AdminModal>

    <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      <article v-for="r in roles" :key="r.id" class="card flex flex-col p-4">
        <div class="flex items-start justify-between gap-2">
          <div>
            <h2 class="flex flex-wrap items-center gap-2 font-bold text-ink">
              {{ r.name }}
              <span v-if="r.system" class="chip bg-hela-green text-hela-gold">Built-in</span>
              <span v-if="r.branchScoped" class="chip bg-cream text-ink">Branch role</span>
            </h2>
            <p class="text-xs text-muted">Level {{ r.level }} · {{ r.members }} {{ r.members === 1 ? 'member' : 'members' }}</p>
          </div>
          <span class="text-right text-xs font-semibold text-hela-green">{{ r.permissions.length }}/{{ total }}<br>permissions</span>
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
            <span class="mt-1 block text-xs text-muted">{{ scope === 'tenant' ? 'Chain Admin is 80, Branch Manager 60.' : 'Super Admin is 100.' }}</span>
          </label>
          <label v-if="scope === 'tenant'" class="flex items-start gap-2.5 text-sm">
            <input v-model="f.branchScoped" type="checkbox" class="mt-0.5 size-4 accent-hela-green">
            <span>Branch role <span class="block text-xs text-muted">People with this role work at specific branches and only see those branches.</span></span>
          </label>
          <p class="text-xs font-semibold text-ink">{{ f.permissions.length }} permissions selected</p>
          <p v-if="error" class="text-sm text-[#8A2E2E]" role="alert">{{ error }}</p>
        </div>
        <PermissionMatrix v-model="f.permissions" :scope="scope" :grantable="auth.permissions.value" />
      </form>
      <template #footer>
        <button type="button" class="btn-ghost h-9" @click="editing = null">Cancel</button>
        <button type="submit" form="role-form" class="btn-primary h-9">Save role</button>
      </template>
    </AdminModal>
  </div>
</template>
