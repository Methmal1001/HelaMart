<script setup lang="ts">
import type { IconName } from '~/types'
import type { StageAppliesTo } from '~/types/admin'
import { getWorkflow, resetBranchWorkflow, saveWorkflow, type DeskOfficer, type StageInput, type WorkflowView } from '~/services/admin/orderDeskApi'
import { STANDARD_STAGES, stageApplies } from '~/lib/workflow'

/**
 * Order workflow: the sections every online order passes through, in order,
 * who works each one, and what the customer sees. The chain default applies to
 * every branch; a branch can have its own (set by chain-level staff, or by that
 * branch's staff when the admin grants "Customise the order workflow").
 */
definePageMeta({ layout: 'admin', middleware: 'admin', scope: 'tenant' })
useHead({ title: 'Order workflow' })

const auth = useAdminAuth()
const notify = useAdminNotify()
const { confirm } = useAdminConfirm()

const draft = ref<(StageInput & { key: string; open: boolean })[]>([])
const saved = ref('')
const officers = ref<DeskOfficer[]>([])
const canEdit = ref(false)
const loading = ref(true)
const saving = ref(false)
const meta = ref<{ updatedAt?: string; updatedBy?: string }>({})
let keySeq = 0

function setDraft(stages: StageInput[]) {
  draft.value = stages.map((s) => ({ ...s, officerIds: [...s.officerIds], key: `k${keySeq++}`, open: false }))
  saved.value = snapshot()
}
const snapshot = () => JSON.stringify(draft.value.map(({ key: _k, open: _o, ...s }) => s))
const dirty = computed(() => !loading.value && snapshot() !== saved.value)

const view = ref<WorkflowView | null>(null)
/** null = the chain default; otherwise a branch. */
const scopeId = ref<string | null>(null)
const branchName = computed(() => view.value?.branches.find((b) => b.id === scopeId.value)?.name ?? '')
/** The branch follows the chain default and may get its own. */
const canCustomise = computed(() => !!view.value?.inherited && view.value.canEdit && !auth.readOnly.value && !canEdit.value)

async function load(branchId: string | null) {
  loading.value = true
  try {
    const r = await auth.call((t) => getWorkflow(t, branchId))
    view.value = r
    scopeId.value = r.branchId
    officers.value = r.officers
    // A branch following the chain default is shown read-only until someone gives it its own.
    canEdit.value = r.canEdit && !r.inherited && !auth.readOnly.value
    meta.value = { updatedAt: r.workflow.updatedAt, updatedBy: r.workflow.updatedBy }
    setDraft(r.workflow.stages)
  } catch (e) {
    notify.error(e)
  } finally {
    loading.value = false
  }
}
onMounted(() => load(null))

async function switchTo(branchId: string | null) {
  if (branchId === scopeId.value) return
  if (dirty.value) {
    const r = await confirm({ title: 'Discard your changes?', message: 'You have unsaved changes to this workflow.', confirmLabel: 'Discard', tone: 'danger' })
    if (!r.ok) return
  }
  await load(branchId)
}
function customise() {
  canEdit.value = true
  saved.value = ''
}
async function useChainDefault() {
  if (!scopeId.value) return
  const r = await confirm({ title: `Use the chain default at ${branchName.value}?`, message: `${branchName.value}’s own sections and officer assignments are removed; new orders follow the chain default.`, confirmLabel: 'Use chain default', tone: 'danger' })
  if (!r.ok) return
  try {
    await auth.call((t) => resetBranchWorkflow(t, scopeId.value!))
    notify.ok(`${branchName.value} now follows the chain default`)
    await load(scopeId.value)
  } catch (e) {
    notify.error(e)
  }
}

const ICONS: { icon: IconName; label: string }[] = [
  { icon: 'cash', label: 'Cashier' }, { icon: 'package', label: 'Packing' }, { icon: 'shield', label: 'Checking' }, { icon: 'truck', label: 'Delivery' },
  { icon: 'store', label: 'Counter' }, { icon: 'snowflake', label: 'Cold chain' }, { icon: 'clipboard', label: 'Checklist' }, { icon: 'card', label: 'Payment' },
  { icon: 'receipt', label: 'Billing' }, { icon: 'check', label: 'Approval' }, { icon: 'user', label: 'Person' }, { icon: 'tag', label: 'Labels' },
]
const APPLIES: { v: StageAppliesTo; l: string }[] = [{ v: 'all', l: 'All orders' }, { v: 'delivery', l: 'Delivery only' }, { v: 'pickup', l: 'Pickup only' }]

function move(i: number, dir: -1 | 1) {
  const j = i + dir
  if (j < 0 || j >= draft.value.length) return
  const list = draft.value
  ;[list[i], list[j]] = [list[j]!, list[i]!]
}
async function remove(i: number) {
  const s = draft.value[i]!
  const r = await confirm({ title: `Remove ${s.name || 'this section'}?`, message: 'New orders will skip it. Orders already waiting in it can still be finished by a supervisor.', confirmLabel: 'Remove section', tone: 'danger' })
  if (r.ok) draft.value.splice(i, 1)
}
function add() {
  draft.value.push({
    key: `k${keySeq++}`, open: true, name: '', description: '', icon: 'clipboard', appliesTo: 'all', officerIds: [], printSlip: false,
    completeLabel: '', customerActiveLabel: '', customerDoneLabel: '', customerHint: '',
  })
  nextTick(() => document.querySelector<HTMLInputElement>(`[data-testid=wf-name-${draft.value.length - 1}]`)?.focus())
}
async function resetStandard() {
  const r = await confirm({ title: 'Go back to the standard sections?', message: 'Cashier → Packing → Verification → Delivery (Pickup counter for pickups). Officers already assigned to those sections are kept.', confirmLabel: 'Use standard sections' })
  if (!r.ok) return
  const keep = new Map(draft.value.filter((s) => s.id).map((s) => [s.id!, s.officerIds]))
  setDraft(STANDARD_STAGES.map((s) => ({ ...s, officerIds: keep.get(s.id) ?? [] })))
  saved.value = ''
}
function toggleOfficer(s: StageInput, id: string) {
  const i = s.officerIds.indexOf(id)
  if (i >= 0) s.officerIds.splice(i, 1)
  else s.officerIds.push(id)
}
const officerQuery = ref<Record<string, string>>({})
function officersFor(key: string) {
  const q = (officerQuery.value[key] ?? '').trim().toLowerCase()
  const list = officers.value.filter((o) => o.status === 'active')
  return q ? list.filter((o) => `${o.name} ${o.title} ${o.roleName} ${o.branchNames.join(' ')}`.toLowerCase().includes(q)) : list
}
const nameOf = (id: string) => officers.value.find((o) => o.id === id)?.name ?? 'Former officer'

const path = (m: 'delivery' | 'pickup') => draft.value.filter((s) => stageApplies(s, m))
const problems = computed(() => {
  const out: string[] = []
  if (!path('delivery').length) out.push('Home-delivery orders need at least one section.')
  if (!path('pickup').length) out.push('Store-pickup orders need at least one section.')
  draft.value.forEach((s, i) => s.name.trim().length < 2 && out.push(`Section ${i + 1} needs a name.`))
  return out
})

async function save() {
  if (problems.value.length) return notify.error(new Error(problems.value[0]))
  saving.value = true
  try {
    const wf = await auth.call((t) => saveWorkflow(t, draft.value.map(({ key: _k, open: _o, ...s }) => s), scopeId.value))
    notify.ok(scopeId.value ? `${branchName.value} branch workflow saved` : 'Chain default workflow saved')
    await load(scopeId.value)
    meta.value = { updatedAt: wf.updatedAt, updatedBy: wf.updatedBy }
  } catch (e) {
    notify.error(e)
  } finally {
    saving.value = false
  }
}
const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleString('en-LK', { dateStyle: 'medium', timeStyle: 'short' }) : '')
onBeforeRouteLeave(async () => {
  if (!dirty.value) return true
  const r = await confirm({ title: 'Leave without saving?', message: 'Your changes to the order workflow will be lost.', confirmLabel: 'Leave', tone: 'danger' })
  return r.ok
})
</script>

<template>
  <div class="pb-24">
    <AdminPageHeader title="Order workflow" description="The sections every online order goes through, in order, and the officers who work each one. Officers only see and update their own sections; the customer’s tracking follows each step.">
      <NuxtLink to="/admin/order-desk" class="btn-ghost h-10"><AppIcon name="clipboard" :size="16" />Open order desk</NuxtLink>
    </AdminPageHeader>

    <div v-if="loading" class="space-y-3"><div v-for="i in 4" :key="i" class="h-24 animate-pulse rounded-2xl bg-white" /></div>

    <template v-else>
      <!-- Which workflow -->
      <div v-if="view && (view.branches.length > 1 || view.canEditChain)" class="mb-4 flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Workflow for" data-testid="wf-scopes">
        <button v-if="view.canEditChain" type="button" role="tab" :aria-selected="scopeId === null" class="rounded-full px-3 py-1.5 text-sm font-semibold ring-1 transition" :class="scopeId === null ? 'bg-hela-green text-white ring-hela-green' : 'bg-white text-ink ring-line hover:ring-hela-green'" data-testid="wf-scope-chain" @click="switchTo(null)">
          Chain default
        </button>
        <button v-for="b in view.branches" :key="b.id" type="button" role="tab" :aria-selected="scopeId === b.id" class="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold ring-1 transition" :class="scopeId === b.id ? 'bg-hela-green text-white ring-hela-green' : 'bg-white text-ink ring-line hover:ring-hela-green'" :data-testid="`wf-scope-${b.id}`" @click="switchTo(b.id)">
          {{ b.name }}
          <span class="rounded-full px-1.5 text-[0.6rem] font-bold" :class="scopeId === b.id ? 'bg-white/20' : b.custom ? 'bg-hela-gold-100 text-[#6d5622]' : 'bg-cream text-muted'">{{ b.custom ? 'own' : 'default' }}</span>
        </button>
      </div>

      <div v-if="view?.inherited" class="mb-4 flex flex-wrap items-center gap-3 rounded-xl bg-white p-3 text-sm ring-1 ring-line" data-testid="wf-inherited">
        <AppIcon name="info" :size="16" class="shrink-0 text-hela-green" />
        <span class="min-w-0 flex-1"><b class="text-ink">{{ branchName }}</b> follows the chain default.{{ canEdit ? ' Change the sections or officers below, then save to give it its own workflow.' : '' }}</span>
        <button v-if="canCustomise" type="button" class="btn-primary h-9 text-sm" data-testid="wf-customise" @click="customise">Give {{ branchName }} its own workflow</button>
      </div>
      <div v-else-if="scopeId && view" class="mb-4 flex flex-wrap items-center gap-3 rounded-xl bg-hela-gold-100/60 p-3 text-sm text-[#6d5622]" data-testid="wf-own">
        <AppIcon name="settings" :size="16" class="shrink-0" />
        <span class="min-w-0 flex-1"><b>{{ branchName }}</b> has its own workflow — new orders there follow these sections and officers.</span>
        <button v-if="view.canEdit && !auth.readOnly.value" type="button" class="btn-ghost h-9 text-sm" data-testid="wf-use-default" @click="useChainDefault">Use the chain default again</button>
      </div>
      <p v-if="!canEdit && !canCustomise" class="mb-4 flex items-start gap-2 rounded-xl bg-hela-gold-100/70 p-3 text-sm text-[#6d5622]" data-testid="wf-readonly">
        <AppIcon name="lock" :size="16" class="mt-0.5 shrink-0" />You can see how this workflow is set up. Changing it needs “Customise the order workflow”{{ scopeId ? ' for this branch' : ' at chain level' }} — ask your supermarket admin.
      </p>

      <!-- Paths -->
      <div class="mb-5 grid gap-3 md:grid-cols-2">
        <div v-for="m in (['delivery', 'pickup'] as const)" :key="m" class="rounded-2xl bg-white p-4 ring-1 ring-line" :data-testid="`wf-path-${m}`">
          <p class="mb-2 flex items-center gap-2 text-xs font-bold tracking-wide text-muted uppercase"><AppIcon :name="m === 'delivery' ? 'truck' : 'store'" :size="14" />{{ m === 'delivery' ? 'Home delivery orders' : 'Store pickup orders' }}</p>
          <ol class="flex flex-wrap items-center gap-1.5 text-sm">
            <li class="rounded-full bg-cream px-2.5 py-1 text-xs font-semibold text-muted">Order placed</li>
            <template v-for="s in path(m)" :key="s.key">
              <AppIcon name="arrow-right" :size="12" class="text-muted" />
              <li class="inline-flex items-center gap-1 rounded-full bg-hela-green-50 px-2.5 py-1 text-xs font-bold text-hela-green"><AppIcon :name="s.icon" :size="12" />{{ s.name || 'Untitled' }}<AppIcon v-if="s.printSlip" name="printer" :size="11" class="opacity-70" :aria-label="'prints slip'" /></li>
            </template>
            <AppIcon name="arrow-right" :size="12" class="text-muted" />
            <li class="rounded-full bg-hela-green px-2.5 py-1 text-xs font-bold text-white">{{ m === 'delivery' ? 'Delivered' : 'Collected' }}</li>
          </ol>
        </div>
      </div>

      <!-- Sections -->
      <ol class="space-y-3" data-testid="wf-stages">
        <li v-for="(s, i) in draft" :key="s.key" class="rounded-2xl bg-white ring-1 ring-line" :data-testid="`wf-stage-${i}`">
          <div class="flex flex-wrap items-start gap-3 p-4">
            <span class="grid size-11 shrink-0 place-items-center rounded-xl bg-hela-green text-hela-gold"><AppIcon :name="s.icon" :size="20" /></span>
            <div class="min-w-0 flex-1 space-y-2">
              <div class="flex flex-wrap items-center gap-2">
                <span class="text-xs font-bold text-muted">{{ i + 1 }}.</span>
                <input v-model="s.name" class="field h-9 w-48 font-bold" maxlength="40" placeholder="Section name" :disabled="!canEdit" :aria-label="`Section ${i + 1} name`" :data-testid="`wf-name-${i}`">
                <select v-model="s.icon" class="field h-9 w-auto text-sm" :disabled="!canEdit" aria-label="Icon">
                  <option v-for="ic in ICONS" :key="ic.icon" :value="ic.icon">{{ ic.label }} icon</option>
                </select>
                <div class="flex rounded-lg bg-cream p-0.5" role="radiogroup" :aria-label="`Orders through ${s.name}`">
                  <button v-for="a in APPLIES" :key="a.v" type="button" role="radio" :aria-checked="s.appliesTo === a.v" :disabled="!canEdit" class="rounded-md px-2 py-1 text-xs font-semibold transition" :class="s.appliesTo === a.v ? 'bg-white text-ink shadow-sm' : 'text-muted'" @click="s.appliesTo = a.v">{{ a.l }}</button>
                </div>
              </div>
              <input v-model="s.description" class="field h-9 text-sm" maxlength="200" placeholder="What officers do in this section" :disabled="!canEdit" :aria-label="`What ${s.name} does`">
              <label class="inline-flex items-center gap-2 text-xs font-semibold text-ink" :class="{ 'opacity-60': !canEdit }">
                <input v-model="s.printSlip" type="checkbox" class="size-4 accent-hela-green" :disabled="!canEdit" :data-testid="`wf-print-${i}`">
                <AppIcon name="printer" :size="13" />Print the order slip (customer details + tracking QR) when this section is finished
              </label>
            </div>
            <div v-if="canEdit" class="flex shrink-0 gap-1">
              <button type="button" class="grid size-8 place-items-center rounded-lg text-muted hover:bg-cream disabled:opacity-30" :disabled="i === 0" :aria-label="`Move ${s.name} up`" @click="move(i, -1)"><AppIcon name="arrow-left" :size="15" class="rotate-90" /></button>
              <button type="button" class="grid size-8 place-items-center rounded-lg text-muted hover:bg-cream disabled:opacity-30" :disabled="i === draft.length - 1" :aria-label="`Move ${s.name} down`" @click="move(i, 1)"><AppIcon name="arrow-left" :size="15" class="-rotate-90" /></button>
              <button type="button" class="grid size-8 place-items-center rounded-lg text-[#8A2E2E] hover:bg-[#FBEAEA]" :aria-label="`Remove ${s.name}`" @click="remove(i)"><AppIcon name="trash" :size="15" /></button>
            </div>
          </div>

          <!-- Officers -->
          <div class="border-t border-line px-4 py-3">
            <div class="flex flex-wrap items-center gap-2">
              <p class="text-xs font-bold text-muted">Officers ({{ s.officerIds.length }})</p>
              <span v-for="id in s.officerIds" :key="id" class="inline-flex items-center gap-1 rounded-full bg-hela-green-50 py-0.5 pr-1 pl-2 text-xs font-semibold text-hela-green">
                {{ nameOf(id) }}
                <button v-if="canEdit" type="button" class="grid size-4 place-items-center rounded-full hover:bg-hela-green hover:text-white" :aria-label="`Remove ${nameOf(id)} from ${s.name}`" @click="toggleOfficer(s, id)"><AppIcon name="close" :size="10" /></button>
              </span>
              <span v-if="!s.officerIds.length" class="text-xs font-semibold text-[#8a3d00]">No officer yet — only supervisors (branch managers, you) can work it.</span>
              <button type="button" class="ml-auto text-xs font-bold text-hela-green hover:underline" :aria-expanded="s.open" :data-testid="`wf-toggle-${i}`" @click="s.open = !s.open">{{ s.open ? 'Close' : canEdit ? 'Assign officers & customer wording' : 'Details' }}</button>
            </div>

            <div v-if="s.open" class="mt-3 grid gap-4 lg:grid-cols-2">
              <div>
                <input v-model="officerQuery[s.key]" type="search" class="field h-9 text-sm" placeholder="Search officers by name, role or branch" :data-testid="`wf-officer-search-${i}`">
                <ul class="mt-1.5 max-h-56 divide-y divide-line overflow-y-auto rounded-lg ring-1 ring-line">
                  <li v-for="o in officersFor(s.key)" :key="o.id">
                    <label class="flex cursor-pointer items-center gap-2.5 px-2.5 py-1.5 text-sm hover:bg-hela-green-50/50">
                      <input type="checkbox" class="size-4 accent-hela-green" :checked="s.officerIds.includes(o.id)" :disabled="!canEdit" :data-testid="`wf-officer-${i}-${o.id}`" @change="toggleOfficer(s, o.id)">
                      <span class="grid size-7 shrink-0 place-items-center rounded-full text-[0.6rem] font-bold text-white" :style="{ background: o.avatarColor }">{{ o.name.split(' ').map((x) => x[0]).slice(0, 2).join('') }}</span>
                      <span class="min-w-0 flex-1"><b class="block truncate text-ink">{{ o.name }}</b><span class="block truncate text-xs text-muted">{{ o.roleName }} · {{ o.branchNames.join(', ') }}</span></span>
                    </label>
                  </li>
                </ul>
                <p class="mt-1 text-[0.7rem] text-muted">Officers work this section at their own branches. Add new officers under Officers &amp; staff.</p>
              </div>
              <div class="grid content-start gap-2 sm:grid-cols-2">
                <label><span class="field-label">Finish button</span><input v-model="s.completeLabel" class="field h-9 text-sm" maxlength="30" placeholder="e.g. Packing done" :disabled="!canEdit"></label>
                <label><span class="field-label">Customer sees while here</span><input v-model="s.customerActiveLabel" class="field h-9 text-sm" maxlength="60" placeholder="e.g. Packing your items" :disabled="!canEdit"></label>
                <label><span class="field-label">Customer sees when done</span><input v-model="s.customerDoneLabel" class="field h-9 text-sm" maxlength="60" placeholder="e.g. Packed" :disabled="!canEdit"></label>
                <label><span class="field-label">Customer note</span><input v-model="s.customerHint" class="field h-9 text-sm" maxlength="120" placeholder="e.g. Picked fresh and packed" :disabled="!canEdit"></label>
              </div>
            </div>
          </div>
        </li>
      </ol>

      <button v-if="canEdit" type="button" class="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line p-4 text-sm font-bold text-hela-green transition hover:border-hela-green hover:bg-hela-green-50" data-testid="wf-add" @click="add">
        <AppIcon name="plus" :size="16" />Add a section
      </button>

      <ul v-if="canEdit && problems.length" class="mt-3 space-y-1 text-sm text-[#8A2E2E]" role="alert">
        <li v-for="p in problems" :key="p">• {{ p }}</li>
      </ul>

      <p class="mt-4 text-xs text-muted">
        Changes apply to new orders. Orders already in progress keep their sections, but officer assignments take effect straight away.
        <template v-if="meta.updatedBy"> Last changed by {{ meta.updatedBy }} · {{ fmt(meta.updatedAt) }}.</template>
      </p>

      <!-- Save bar -->
      <div v-if="canEdit" class="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 px-4 py-3 backdrop-blur lg:left-64">
        <div class="mx-auto flex max-w-6xl flex-wrap items-center gap-2">
          <span class="mr-auto text-sm" :class="dirty ? 'font-semibold text-ink' : 'text-muted'">{{ scopeId ? `${branchName} branch` : 'Chain default' }} · {{ dirty ? 'Unsaved changes' : 'All changes saved' }}</span>
          <button type="button" class="btn-ghost h-10 text-sm" @click="resetStandard">Use standard sections</button>
          <button type="button" class="btn-primary h-10 text-sm" :disabled="saving || !dirty" data-testid="wf-save" @click="save">{{ saving ? 'Saving…' : 'Save workflow' }}</button>
        </div>
      </div>
    </template>
  </div>
</template>
