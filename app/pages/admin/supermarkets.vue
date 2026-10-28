<script setup lang="ts">
import type { TableColumn, Tenant, TenantStatus } from '~/types/admin'
import {
  addChainAdmin,
  approveTenant,
  getTenant,
  listTenants,
  moderateTenant,
  rejectTenant,
  resetChainAdminPassword,
  setChainAdminStatus,
  updateTenantTerms,
  verifyDocument,
  type TenantDetail,
  type TenantSummary,
} from '~/services/admin/platformApi'

definePageMeta({ layout: 'admin', middleware: 'admin', scope: 'platform', permission: 'tenants.view' })
useHead({ title: 'Supermarkets' })

const auth = useAdminAuth()
const notify = useAdminNotify()
const { confirm } = useAdminConfirm()
const route = useRoute()
const tenants = ref<TenantSummary[]>([])
const loading = ref(true)
const status = ref<'all' | TenantStatus>((route.query.status as TenantStatus) || 'all')

async function load() {
  loading.value = true
  try {
    tenants.value = await auth.call(listTenants)
  } catch (e) {
    notify.error(e)
  } finally {
    loading.value = false
  }
}
onMounted(async () => {
  await load()
  if (typeof route.query.open === 'string') await open(route.query.open)
})

const rows = computed(() => tenants.value.filter((t) => status.value === 'all' || t.status === status.value))
const countOf = (s: TenantStatus) => tenants.value.filter((t) => t.status === s).length
const columns: TableColumn[] = [
  { key: 'name', label: 'Supermarket', sortable: true, value: (t: TenantSummary) => `${t.name} ${t.legalName} ${t.reference} ${t.ownerName}` },
  { key: 'district', label: 'District', sortable: true },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'branchCount', label: 'Branches', sortable: true, align: 'right' },
  { key: 'orders30d', label: 'Orders (30d)', sortable: true, align: 'right' },
  { key: 'gmv30dCents', label: 'Sales (30d)', sortable: true, align: 'right' },
  { key: 'createdAt', label: 'Applied', sortable: true },
]
const day = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('en-LK', { day: 'numeric', month: 'short', year: 'numeric' }) : '—')

// ---- detail
const detail = ref<TenantDetail | null>(null)
const busy = ref(false)
const showNic = ref(false)
async function open(id: string) {
  showNic.value = false
  try {
    detail.value = await auth.call((t) => getTenant(t, id))
  } catch (e) {
    notify.error(e)
  }
}
async function refresh() {
  if (detail.value) await open(detail.value.tenant.id)
  await load()
}
const t = computed(() => detail.value?.tenant ?? null)
const DOC_LABEL: Record<Tenant['documents'][number]['kind'], string> = { br_certificate: 'Business registration certificate', owner_nic: 'Owner’s NIC copy', address_proof: 'Proof of business address' }
const maskedNic = (nic: string) => (showNic.value ? nic : `${nic.slice(0, 3)}${'•'.repeat(Math.max(0, nic.length - 6))}${nic.slice(-3)}`)

async function toggleDoc(kind: Tenant['documents'][number]['kind'], verified: boolean) {
  if (!t.value) return
  const id = t.value.id
  try {
    await auth.call((tok) => verifyDocument(tok, id, kind, verified))
    await refresh()
  } catch (e) {
    notify.error(e)
  }
}

// ---- approve
const approving = ref(false)
const terms = reactive({ plan: 'standard' as Tenant['plan'], commission: 3.5 })
const secret = ref<{ title: string; name: string; email: string; password: string } | null>(null)
function startApprove() {
  if (!t.value) return
  Object.assign(terms, { plan: t.value.plan, commission: t.value.commissionPercent })
  approving.value = true
}
async function approve() {
  if (!t.value) return
  const id = t.value.id
  busy.value = true
  try {
    const r = await auth.call((tok) => approveTenant(tok, id, { plan: terms.plan, commissionPercent: Number(terms.commission) }), 'Approving a supermarket needs your password confirmed.')
    approving.value = false
    secret.value = { title: `${r.tenant.name} approved — chain admin created`, name: r.admin.name, email: r.admin.email, password: r.tempPassword }
    await refresh()
  } catch (e) {
    notify.error(e)
  } finally {
    busy.value = false
  }
}

async function reject() {
  if (!t.value) return
  const r = await confirm({ title: `Reject ${t.value.name}?`, message: 'The applicant will see this reason when they check their application status.', confirmLabel: 'Reject application', tone: 'danger', reasonLabel: 'Reason shown to the applicant' })
  if (!r.ok) return
  const id = t.value.id
  try {
    await auth.call((tok) => rejectTenant(tok, id, r.reason))
    notify.ok('Application rejected')
    await refresh()
  } catch (e) {
    notify.error(e)
  }
}

const MOD_TEXT = {
  restrict: { title: 'Restrict', message: 'Their staff can still sign in and view data, but every change is blocked and their stores disappear from the storefront until reinstated.', label: 'Restrict supermarket' },
  ban: { title: 'Ban', message: 'All their staff are signed out immediately and can’t sign in. Their stores disappear from HelaMart. Data is kept for records.', label: 'Ban supermarket' },
  reinstate: { title: 'Reinstate', message: 'Their staff regain full access and their stores reappear for shoppers.', label: 'Reinstate' },
} as const
async function moderate(action: 'restrict' | 'ban' | 'reinstate') {
  if (!t.value) return
  const txt = MOD_TEXT[action]
  const r = await confirm({ title: `${txt.title} ${t.value.name}?`, message: txt.message, confirmLabel: txt.label, tone: action === 'reinstate' ? 'default' : 'danger', reasonLabel: action === 'reinstate' ? 'Note for the record' : 'Reason (shown to the supermarket)' })
  if (!r.ok) return
  const id = t.value.id
  try {
    await auth.call((tok) => moderateTenant(tok, id, action, r.reason), `${txt.title} needs your password confirmed.`)
    notify.ok(`${t.value.name}: ${action === 'reinstate' ? 'reinstated' : `${action === 'ban' ? 'banned' : 'restricted'}`}`)
    await refresh()
  } catch (e) {
    notify.error(e)
  }
}

const editingTerms = ref(false)
async function saveTerms() {
  if (!t.value) return
  const id = t.value.id
  try {
    await auth.call((tok) => updateTenantTerms(tok, id, { plan: terms.plan, commissionPercent: Number(terms.commission) }))
    editingTerms.value = false
    notify.ok('Terms updated')
    await refresh()
  } catch (e) {
    notify.error(e)
  }
}

// ---- admins
const addingAdmin = ref(false)
const adminForm = reactive({ name: '', email: '', phone: '' })
async function addAdmin() {
  if (!t.value) return
  const id = t.value.id
  try {
    const r = await auth.call((tok) => addChainAdmin(tok, id, { ...adminForm }), 'Adding an admin needs your password confirmed.')
    addingAdmin.value = false
    secret.value = { title: 'Supermarket admin created', name: r.admin.name, email: r.admin.email, password: r.tempPassword }
    Object.assign(adminForm, { name: '', email: '', phone: '' })
    await refresh()
  } catch (e) {
    notify.error(e)
  }
}
async function toggleAdmin(id: string, name: string, active: boolean) {
  const r = await confirm({ title: active ? `Suspend ${name}?` : `Reactivate ${name}?`, message: active ? 'They are signed out and can’t sign in until reactivated.' : 'They can sign in again.', confirmLabel: active ? 'Suspend' : 'Reactivate', tone: active ? 'danger' : 'default', reasonLabel: active ? 'Reason' : undefined })
  if (!r.ok) return
  try {
    await auth.call((tok) => setChainAdminStatus(tok, id, active ? 'suspended' : 'active', r.reason), 'Changing an admin’s access needs your password confirmed.')
    await refresh()
  } catch (e) {
    notify.error(e)
  }
}
async function resetAdmin(id: string, name: string, email: string) {
  const r = await confirm({ title: `Reset ${name}’s password?`, message: 'A temporary password is issued and their sessions end.', confirmLabel: 'Reset password', tone: 'danger' })
  if (!r.ok) return
  try {
    const out = await auth.call((tok) => resetChainAdminPassword(tok, id), 'Resetting passwords needs your password confirmed.')
    secret.value = { title: 'Temporary password issued', name, email, password: out.tempPassword }
    await refresh()
  } catch (e) {
    notify.error(e)
  }
}
const allVerified = computed(() => t.value?.documents.every((d) => d.verified) ?? false)
</script>

<template>
  <div>
    <AdminPageHeader title="Supermarkets" description="Review applications, and approve, restrict, ban or reinstate supermarkets on HelaMart." />

    <div class="mb-3 flex flex-wrap gap-2" role="group" aria-label="Filter by status">
      <button
        v-for="s in (['all', 'pending', 'active', 'restricted', 'banned', 'rejected'] as const)"
        :key="s"
        type="button"
        class="chip ring-1 transition"
        :class="status === s ? 'bg-hela-green text-white ring-hela-green' : 'bg-white text-ink ring-line hover:bg-hela-green-50'"
        :aria-pressed="status === s"
        @click="status = s"
      >
        {{ s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1) }}
        <span class="opacity-70">{{ s === 'all' ? tenants.length : countOf(s) }}</span>
      </button>
    </div>

    <AdminDataTable :rows="rows" :columns="columns" row-key="id" :loading="loading" clickable search-placeholder="Search name, reference or owner…" :initial-sort="{ key: 'createdAt', dir: 'desc' }" @row-click="open($event.id)">
      <template #cell-name="{ row }">
        <div class="flex items-center gap-2.5">
          <span class="size-3 shrink-0 rounded-full" :style="{ background: row.brandColor }" aria-hidden="true" />
          <span class="min-w-0"><span class="block font-semibold text-ink">{{ row.name }}</span><span class="block truncate text-xs text-muted">{{ row.reference }} · {{ row.ownerName }}</span></span>
        </div>
      </template>
      <template #cell-status="{ row }"><AdminBadge :value="row.status" /></template>
      <template #cell-gmv30dCents="{ row }"><span class="tabular-nums">{{ formatLKR(row.gmv30dCents) }}</span></template>
      <template #cell-createdAt="{ row }"><span class="text-xs text-muted">{{ day(row.createdAt) }}</span></template>
    </AdminDataTable>

    <AdminModal :open="!!t" :title="t?.name ?? ''" :description="t ? `${t.legalName} · ${t.reference}` : ''" size="xl" @close="detail = null">
      <div v-if="t && detail" class="space-y-5 text-sm">
        <div class="flex flex-wrap items-center gap-2">
          <AdminBadge :value="t.status" />
          <span class="chip bg-cream text-ink">{{ t.plan === 'premium' ? 'Premium plan' : 'Standard plan' }} · {{ t.commissionPercent }}% commission</span>
          <span class="text-xs text-muted">Applied {{ day(t.createdAt) }}<template v-if="t.approvedAt"> · approved {{ day(t.approvedAt) }}</template></span>
        </div>
        <p v-if="t.statusReason" class="rounded-lg p-3" :class="t.status === 'banned' || t.status === 'rejected' ? 'bg-[#FBEAEA] text-[#8A2E2E]' : 'bg-[#FFF4D6] text-[#7A5600]'">
          <b>{{ t.status.charAt(0).toUpperCase() + t.status.slice(1) }}:</b> {{ t.statusReason }} <span class="text-xs">— {{ t.statusChangedBy }}, {{ day(t.statusChangedAt) }}</span>
        </p>

        <div class="grid gap-4 lg:grid-cols-2">
          <section class="card p-4">
            <h3 class="mb-2 text-xs font-bold tracking-wide text-muted uppercase">Business</h3>
            <dl class="grid grid-cols-[9rem_1fr] gap-y-1.5">
              <dt class="text-muted">BR number</dt><dd class="font-semibold">{{ t.brNumber }}</dd>
              <dt class="text-muted">VAT number</dt><dd>{{ t.vatNumber ?? '—' }}</dd>
              <dt class="text-muted">Owner</dt><dd>{{ t.ownerName }}</dd>
              <dt class="text-muted">Owner NIC</dt>
              <dd class="flex items-center gap-2"><code>{{ maskedNic(t.ownerNic) }}</code><button type="button" class="text-xs font-semibold text-hela-green hover:underline" @click="showNic = !showNic">{{ showNic ? 'Hide' : 'Reveal' }}</button></dd>
              <dt class="text-muted">Contact</dt><dd>{{ t.email }} · {{ t.phone }}</dd>
              <dt class="text-muted">Head office</dt><dd>{{ t.hqAddress }}, {{ t.district }}</dd>
              <dt class="text-muted">Planned branches</dt><dd>{{ t.expectedBranches }} (first: {{ t.firstBranch.name }}, {{ t.firstBranch.city }})</dd>
            </dl>
          </section>
          <section class="card p-4">
            <h3 class="mb-2 text-xs font-bold tracking-wide text-muted uppercase">Verification documents</h3>
            <ul class="space-y-2">
              <li v-for="d in t.documents" :key="d.kind" class="flex items-center justify-between gap-2">
                <span class="min-w-0"><span class="block font-semibold text-ink">{{ DOC_LABEL[d.kind] }}</span><span class="block text-xs text-muted">{{ d.fileName }} · {{ d.sizeKb }} KB</span></span>
                <label v-if="auth.can('tenants.review')" class="flex shrink-0 items-center gap-1.5 text-xs font-semibold">
                  <input type="checkbox" class="size-4 accent-hela-green" :checked="d.verified" @change="toggleDoc(d.kind, ($event.target as HTMLInputElement).checked)">Verified
                </label>
                <AdminBadge v-else :value="d.verified ? 'active' : 'pending'" :label="d.verified ? 'Verified' : 'Not verified'" />
              </li>
            </ul>
            <p class="mt-3 text-xs text-muted">Prototype: files are listed by name only — document storage and viewing come with the backend.</p>
          </section>
        </div>

        <section v-if="detail.branches.length">
          <h3 class="mb-2 text-xs font-bold tracking-wide text-muted uppercase">Branches ({{ detail.branches.length }})</h3>
          <div class="grid gap-2 md:grid-cols-2">
            <div v-for="b in detail.branches" :key="b.id" class="card flex items-center justify-between gap-2 p-3">
              <span class="min-w-0"><span class="block font-semibold text-ink">{{ b.name }} <span class="text-xs font-normal text-muted">{{ b.code }}</span></span><span class="block truncate text-xs text-muted">{{ b.city }}, {{ b.district }} · head: {{ b.managerName ?? '—' }}</span></span>
              <AdminBadge :value="b.status === 'open' ? 'active' : b.status === 'closed' ? 'cancelled' : 'pending'" :label="b.status.replace('_', ' ')" />
            </div>
          </div>
        </section>

        <section>
          <div class="mb-2 flex items-center justify-between">
            <h3 class="text-xs font-bold tracking-wide text-muted uppercase">Supermarket admins · {{ detail.staffCount }} staff in total</h3>
            <button v-if="auth.can('tenant_admins.manage') && ['active', 'restricted'].includes(t.status)" type="button" class="btn-ghost h-8 px-3 text-xs" @click="addingAdmin = true"><AppIcon name="plus" :size="14" />Add admin</button>
          </div>
          <p v-if="!detail.admins.length" class="text-muted">No admin accounts yet.</p>
          <ul class="divide-y divide-line">
            <li v-for="a in detail.admins" :key="a.id" class="flex flex-wrap items-center justify-between gap-2 py-2">
              <span class="flex items-center gap-2.5"><UserAvatar :name="a.name" :color="a.avatarColor" :size="30" /><span><span class="block font-semibold text-ink">{{ a.name }}</span><span class="block text-xs text-muted">{{ a.email }} · last sign-in {{ day(a.lastLoginAt) }}</span></span></span>
              <span class="flex items-center gap-1.5">
                <AdminBadge :value="a.status" />
                <template v-if="auth.can('tenant_admins.manage')">
                  <button type="button" class="btn-ghost h-8 px-2.5 text-xs" :aria-label="`Reset password for ${a.name}`" @click="resetAdmin(a.id, a.name, a.email)"><AppIcon name="key" :size="14" /></button>
                  <button type="button" class="btn-ghost h-8 px-2.5 text-xs" @click="toggleAdmin(a.id, a.name, a.status === 'active')">{{ a.status === 'active' ? 'Suspend' : 'Reactivate' }}</button>
                </template>
              </span>
            </li>
          </ul>
        </section>
      </div>

      <template v-if="t" #footer>
        <template v-if="t.status === 'pending' && auth.can('tenants.review')">
          <span v-if="!allVerified" class="mr-auto text-xs text-muted">Verify every document to enable approval.</span>
          <button type="button" class="btn-ghost h-9 text-[#8A2E2E]" @click="reject">Reject</button>
          <button type="button" class="btn-primary h-9" :disabled="!allVerified" @click="startApprove"><AppIcon name="check" :size="16" />Approve</button>
        </template>
        <template v-else-if="auth.can('tenants.moderate')">
          <button v-if="['active', 'restricted'].includes(t.status)" type="button" class="btn-ghost h-9 mr-auto" @click="(Object.assign(terms, { plan: t.plan, commission: t.commissionPercent }), (editingTerms = true))"><AppIcon name="edit" :size="15" />Plan & commission</button>
          <button v-if="t.status === 'active'" type="button" class="btn-ghost h-9 text-[#7A5600]" @click="moderate('restrict')">Restrict</button>
          <button v-if="['active', 'restricted'].includes(t.status)" type="button" class="btn-ghost h-9 text-[#8A2E2E]" @click="moderate('ban')">Ban</button>
          <button v-if="['restricted', 'banned'].includes(t.status)" type="button" class="btn-primary h-9" @click="moderate('reinstate')">Reinstate</button>
        </template>
      </template>
    </AdminModal>

    <AdminModal :open="approving" :title="`Approve ${t?.name ?? ''}`" description="Activates the supermarket, opens its first branch and creates the chain admin account." size="sm" @close="approving = false">
      <form id="approve-form" class="space-y-3" @submit.prevent="approve">
        <label class="block"><span class="field-label">Plan</span><select v-model="terms.plan" class="field"><option value="standard">Standard</option><option value="premium">Premium</option></select></label>
        <label class="block"><span class="field-label">Commission (%)</span><input v-model.number="terms.commission" type="number" step="0.5" min="0" max="20" class="field"></label>
        <p class="rounded-lg bg-white p-3 text-xs text-muted ring-1 ring-line">Chain admin: <b class="text-ink">{{ t?.ownerName }}</b> ({{ t?.email }}) · first branch: <b class="text-ink">{{ t?.firstBranch.name }}</b></p>
      </form>
      <template #footer>
        <button type="button" class="btn-ghost h-9" @click="approving = false">Cancel</button>
        <button type="submit" form="approve-form" class="btn-primary h-9" :disabled="busy">{{ busy ? 'Approving…' : 'Approve supermarket' }}</button>
      </template>
    </AdminModal>

    <AdminModal :open="editingTerms" title="Plan & commission" size="sm" @close="editingTerms = false">
      <form id="terms-form" class="space-y-3" @submit.prevent="saveTerms">
        <label class="block"><span class="field-label">Plan</span><select v-model="terms.plan" class="field"><option value="standard">Standard</option><option value="premium">Premium</option></select></label>
        <label class="block"><span class="field-label">Commission (%)</span><input v-model.number="terms.commission" type="number" step="0.5" min="0" max="20" class="field"></label>
      </form>
      <template #footer>
        <button type="button" class="btn-ghost h-9" @click="editingTerms = false">Cancel</button>
        <button type="submit" form="terms-form" class="btn-primary h-9">Save</button>
      </template>
    </AdminModal>

    <AdminModal :open="addingAdmin" :title="`Add an admin to ${t?.name ?? ''}`" description="Chain admins run the whole supermarket: branches, officers, products and settings." size="sm" @close="addingAdmin = false">
      <form id="admin-form" class="space-y-3" @submit.prevent="addAdmin">
        <label class="block"><span class="field-label">Full name</span><input v-model="adminForm.name" class="field" maxlength="80" data-autofocus></label>
        <label class="block"><span class="field-label">Email</span><input v-model="adminForm.email" type="email" class="field"></label>
        <label class="block"><span class="field-label">Mobile (optional)</span><input v-model="adminForm.phone" type="tel" class="field" placeholder="077 123 4567"></label>
      </form>
      <template #footer>
        <button type="button" class="btn-ghost h-9" @click="addingAdmin = false">Cancel</button>
        <button type="submit" form="admin-form" class="btn-primary h-9">Create admin</button>
      </template>
    </AdminModal>

    <SecretRevealDialog :open="!!secret" :title="secret?.title ?? ''" :name="secret?.name ?? ''" :email="secret?.email ?? ''" :secret="secret?.password ?? ''" @close="secret = null" />
  </div>
</template>
