<script setup lang="ts">
import type { Branch, StaffView } from '~/types/admin'
import { DISTRICTS } from '~/data/sriLanka'
import { PLACES, findPlace } from '~/data/places'
import { listBranches, saveBranch, setBranchStatus, type BranchInput } from '~/services/admin/tenantApi'
import { listTeam } from '~/services/admin/common'

definePageMeta({ layout: 'admin', middleware: 'admin', scope: 'tenant', permission: 'branches.view' })
useHead({ title: 'Branches' })

const auth = useAdminAuth()
const notify = useAdminNotify()
const { confirm } = useAdminConfirm()
const branches = ref<(Branch & { managerName: string | null; staffCount: number })[]>([])
const team = ref<StaffView[]>([])
const canManage = computed(() => auth.can('branches.manage') && auth.isChainLevel.value && !auth.readOnly.value)

async function load() {
  try {
    branches.value = await auth.call(listBranches)
    if (auth.can('staff.view')) team.value = await auth.call(listTeam)
  } catch (e) {
    notify.error(e)
  }
}
onMounted(load)

const editing = ref<Branch | 'new' | null>(null)
const f = reactive<BranchInput>({ name: '', district: 'Gampaha', city: '', address: '', phone: '', openingHours: 'Daily 7:00 AM – 10:00 PM', deliveryRadiusKm: 8, managerId: '' })
// Branches are placed on the shoppers' area map from their town.
const townOptions = computed(() => PLACES.filter((p) => p.district === f.district))
const pinHint = computed(() => {
  const town = findPlace(f.city, f.district)
  if (town) return { exact: true, text: town.district === f.district ? `Shown on the shoppers’ map at ${town.name}` : `${town.name} is in ${town.district} — check the district` }
  return { exact: false, text: f.city ? `Town not found — shown at the centre of ${f.district} district` : `Pick a town so shoppers nearby can find this branch` }
})
const error = ref('')
function open(b: Branch | 'new') {
  editing.value = b
  error.value = ''
  Object.assign(f, b === 'new' ? { name: '', district: 'Gampaha', city: '', address: '', phone: '', openingHours: 'Daily 7:00 AM – 10:00 PM', deliveryRadiusKm: 8, managerId: '' } : { ...b, managerId: b.managerId ?? '' })
}
async function save() {
  error.value = ''
  const id = editing.value === 'new' ? undefined : editing.value?.id
  try {
    const b = await auth.call((t) => saveBranch(t, { ...f, deliveryRadiusKm: Number(f.deliveryRadiusKm) }, id))
    notify.ok(id ? `${b.name} updated` : `${b.name} branch opened — now set its delivery area`)
    editing.value = null
    await load()
    // A new branch is hidden from shoppers until its delivery area is set.
    if (!id) coverageFor.value = b
  } catch (e) {
    error.value = (e as Error).message
  }
}

const coverageFor = ref<Branch | null>(null)
async function onCoverageSaved() {
  coverageFor.value = null
  await load()
}

async function changeStatus(b: Branch, status: Branch['status']) {
  const r = await confirm({
    title: status === 'open' ? `Re-open ${b.name}?` : status === 'closed' ? `Close ${b.name} permanently?` : `Temporarily close ${b.name}?`,
    message: status === 'open' ? 'Shoppers can order from this branch again.' : 'Shoppers won’t be able to order from this branch.',
    confirmLabel: status === 'open' ? 'Re-open branch' : 'Close branch',
    tone: status === 'open' ? 'default' : 'danger',
    reasonLabel: status === 'open' ? undefined : 'Reason',
  })
  if (!r.ok) return
  try {
    await auth.call((t) => setBranchStatus(t, b.id, status, r.reason))
    await load()
  } catch (e) {
    notify.error(e)
  }
}
</script>

<template>
  <div>
    <AdminPageHeader :title="`${auth.user.value?.tenantName} branches`" description="Each branch has its own head, officers, stock and orders.">
      <button v-if="canManage" type="button" class="btn-primary h-10" @click="open('new')"><AppIcon name="plus" :size="17" />Open a new branch</button>
    </AdminPageHeader>

    <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      <article v-for="b in branches" :key="b.id" class="card flex flex-col p-4">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <h2 class="truncate text-base font-bold text-ink">{{ b.name }}</h2>
            <p class="text-xs text-muted">{{ b.code }} · {{ b.city }}, {{ b.district }} District</p>
          </div>
          <AdminBadge :value="b.status === 'open' ? 'active' : b.status === 'closed' ? 'cancelled' : 'pending'" :label="b.status === 'open' ? 'Open' : b.status === 'closed' ? 'Closed' : 'Temporarily closed'" />
        </div>
        <dl class="mt-3 grid grid-cols-[6.5rem_1fr] gap-y-1 text-sm">
          <dt class="text-muted">Branch head</dt><dd class="font-semibold text-ink">{{ b.managerName ?? 'Not appointed' }}</dd>
          <dt class="text-muted">Team</dt><dd>{{ b.staffCount }} staff</dd>
          <dt class="text-muted">Address</dt><dd class="text-ink">{{ b.address }}</dd>
          <dt class="text-muted">Hours</dt><dd>{{ b.openingHours }}</dd>
          <dt class="text-muted">Delivers to</dt>
          <dd v-if="b.coverage" class="text-ink" :title="b.coverage.places.join(', ')">{{ b.coverage.places.length }} places · {{ b.coverage.areaKm2 }} km²<span class="block truncate text-xs text-muted">{{ b.coverage.places.slice(0, 4).join(', ') }}{{ b.coverage.places.length > 4 ? '…' : '' }}</span></dd>
          <dd v-else class="font-semibold text-[#8A2E2E]" data-testid="coverage-missing">Not set — hidden from shoppers</dd>
        </dl>
        <div v-if="auth.can('branches.manage') && !auth.readOnly.value" class="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
          <button v-if="canManage" type="button" class="btn-ghost h-8 px-3 text-xs" @click="open(b)"><AppIcon name="edit" :size="14" />Edit</button>
          <button type="button" class="btn-ghost h-8 px-3 text-xs" :class="b.coverage ? '' : 'bg-[#FBEAEA] text-[#8A2E2E]'" :data-testid="`coverage-${b.id}`" @click="coverageFor = b"><AppIcon name="map" :size="14" />Delivery area</button>
          <button v-if="b.status !== 'open'" type="button" class="btn-ghost h-8 px-3 text-xs" @click="changeStatus(b, 'open')">Re-open</button>
          <button v-if="b.status === 'open'" type="button" class="btn-ghost h-8 px-3 text-xs" @click="changeStatus(b, 'temporarily_closed')">Close temporarily</button>
          <button v-if="b.status !== 'closed' && canManage" type="button" class="btn-ghost h-8 px-3 text-xs text-[#8A2E2E]" @click="changeStatus(b, 'closed')">Close</button>
        </div>
      </article>
    </div>

    <AdminModal :open="!!coverageFor" :title="`Delivery area — ${coverageFor?.name ?? ''}`" description="Draw where this branch delivers and list the cities and villages inside it. Shoppers outside this area can’t choose the branch." size="xl" @close="coverageFor = null">
      <CoverageEditor v-if="coverageFor" :key="coverageFor.id" :branch="coverageFor" @saved="onCoverageSaved" @cancel="coverageFor = null" />
    </AdminModal>

    <AdminModal :open="!!editing" :title="editing === 'new' ? 'Open a new branch' : `Edit ${f.name}`" size="lg" @close="editing = null">
      <form id="branch-form" class="grid gap-3 sm:grid-cols-2" @submit.prevent="save">
        <label><span class="field-label">Branch name</span><input v-model="f.name" class="field" maxlength="60" placeholder="e.g. Divulapitiya" data-autofocus></label>
        <label>
          <span class="field-label">Town / city</span>
          <input v-model="f.city" class="field" maxlength="60" list="branch-towns" autocomplete="off">
          <datalist id="branch-towns"><option v-for="p in townOptions" :key="p.name" :value="p.name">{{ p.district }}</option></datalist>
          <span class="mt-1 flex items-center gap-1 text-xs" :class="pinHint.exact ? 'text-hela-green' : 'text-[#7A5600]'"><AppIcon name="pin" :size="12" />{{ pinHint.text }}</span>
        </label>
        <label><span class="field-label">District</span><select v-model="f.district" class="field"><option v-for="d in DISTRICTS" :key="d" :value="d">{{ d }}</option></select></label>
        <label><span class="field-label">Phone</span><input v-model="f.phone" class="field" maxlength="30"></label>
        <label class="sm:col-span-2"><span class="field-label">Address</span><input v-model="f.address" class="field" maxlength="200"></label>
        <label><span class="field-label">Opening hours</span><input v-model="f.openingHours" class="field" maxlength="80"></label>
        <label class="sm:col-span-2"><span class="field-label">Branch head</span>
          <select v-model="f.managerId" class="field">
            <option value="">Not appointed yet</option>
            <option v-for="s in team.filter((x) => x.status === 'active')" :key="s.id" :value="s.id">{{ s.name }} — {{ s.roleName }}</option>
          </select>
          <span class="mt-1 block text-xs text-muted">To create a new branch head, add them under Officers & staff with the “Branch Manager” role.</span>
        </label>
        <p v-if="error" class="text-sm text-[#8A2E2E] sm:col-span-2" role="alert">{{ error }}</p>
      </form>
      <template #footer>
        <button type="button" class="btn-ghost h-9" @click="editing = null">Cancel</button>
        <button type="submit" form="branch-form" class="btn-primary h-9">{{ editing === 'new' ? 'Open branch' : 'Save' }}</button>
      </template>
    </AdminModal>
  </div>
</template>
