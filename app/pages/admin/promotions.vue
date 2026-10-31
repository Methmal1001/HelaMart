<script setup lang="ts">
import type { AdminOffer, TableColumn } from '~/types/admin'
import type { CategoryId, ItemTarget, OfferConditions, OfferRule } from '~/types'
import type { ScheduleState } from '~/utils/schedule'
import { branchDirectory, setOfferSchedule, deleteOffer, listChainCustomers, listOfferProducts, listOffers, saveOffer, setOfferStatus, type ChainCustomer, type OfferInput } from '~/services/admin/tenantApi'

definePageMeta({ layout: 'admin', middleware: 'admin', scope: 'tenant', permission: 'promotions.view' })
useHead({ title: 'Promotions' })

const auth = useAdminAuth()
const notify = useAdminNotify()
const { confirm } = useAdminConfirm()
const offers = ref<AdminOffer[]>([])
const customers = ref<ChainCustomer[]>([])
const branches = ref<{ id: string; name: string }[]>([])
const loading = ref(true)
type PickProduct = Awaited<ReturnType<typeof listOfferProducts>>[number]
const products = ref<PickProduct[]>([])
const canManage = computed(() => auth.can('promotions.manage') && !auth.readOnly.value)

const { categories, load: loadCategories } = useTenantCategories()

onMounted(async () => {
  try {
    ;[offers.value, branches.value, products.value] = await Promise.all([auth.call(listOffers), auth.call(branchDirectory), auth.call(listOfferProducts), loadCategories()])
    if (auth.can('customers.view')) customers.value = await auth.call(listChainCustomers)
  } catch (e) {
    notify.error(e)
  } finally {
    loading.value = false
  }
})

/** Names from this chain's own catalogue (the admin isn't browsing a store, so the shopper catalogue can't name them). */
const productName = (id: string) => products.value.find((p) => p.id === id)?.name
const categoryName = (id: CategoryId) => categories.value.find((c) => c.id === id)?.name ?? id
function targetText(t: ItemTarget) {
  if (t.all) return 'everything'
  const names = [...t.categoryIds.map(categoryName), ...t.productIds.map((id) => productName(id) ?? 'a removed product')]
  return names.length <= 3 ? names.join(', ') : `${names.slice(0, 2).join(', ')} + ${names.length - 2} more`
}
function ruleText(r: OfferRule) {
  const t = ruleTarget(r)
  if (!t) return describeRule(r)
  const what = targetText(t)
  if (r.kind === 'amount-items') return `${formatLKR(r.amountCents)} off each · ${what}`
  if (r.kind === 'bxgy') return `Buy ${r.buy} get ${r.get} free · ${what}`
  if ('percent' in r) return `${r.percent}% off ${what}${'maxDiscountCents' in r && r.maxDiscountCents ? ` (max ${formatLKR(r.maxDiscountCents)})` : ''}`
  return describeRule(r)
}
const describe = (o: AdminOffer) => [ruleText(o.rule), ...offerConditionChips(o)].join(' · ')
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
/** Publishing life-cycle: live, scheduled, paused or ended. */
const lifeOf = (o: AdminOffer) => ({ status: o.status, startsAt: o.conditions?.startsAt, endsAt: o.expiresAt })
const stateOf = (o: AdminOffer) => scheduleState(lifeOf(o))
const tab = ref<'all' | ScheduleState>('all')
const counts = computed(() => {
  const c: Record<string, number> = { all: offers.value.length, live: 0, scheduled: 0, paused: 0, ended: 0 }
  for (const o of offers.value) c[stateOf(o)]!++
  return c
})
const shown = computed(() => (tab.value === 'all' ? offers.value : offers.value.filter((o) => stateOf(o) === tab.value)))
const TABS: { id: 'all' | ScheduleState; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'live', label: 'Live' }, { id: 'scheduled', label: 'Scheduled' }, { id: 'paused', label: 'Paused' }, { id: 'ended', label: 'Ended' },
]
const audienceText = (o: AdminOffer) => (o.audience === 'all' ? 'All customers' : o.audience === 'new' ? 'New customers' : `${o.customerIds.length} selected`)
const branchText = (o: AdminOffer) => (o.branchIds.length ? o.branchIds.map((id) => branches.value.find((b) => b.id === id)?.name ?? id).join(', ') : 'All branches')

const columns: TableColumn[] = [
  { key: 'code', label: 'Offer', sortable: true, value: (o: AdminOffer) => `${o.code} ${o.title}` },
  { key: 'rule', label: 'Rule & conditions', value: (o: AdminOffer) => describe(o) },
  { key: 'audience', label: 'Audience', value: (o: AdminOffer) => audienceText(o) },
  { key: 'branches', label: 'Branches', value: (o: AdminOffer) => branchText(o) },
  { key: 'usageCount', label: 'Used', sortable: true, align: 'right' },
  { key: 'expiresAt', label: 'Schedule', sortable: true, value: (o: AdminOffer) => scheduleText(lifeOf(o)) },
  { key: 'status', label: 'Status', value: (o: AdminOffer) => stateOf(o) },
  { key: 'actions', label: '', align: 'right', value: () => '' },
]

// ---- editor
type Kind = OfferRule['kind']
const editing = ref<AdminOffer | 'new' | null>(null)
const f = reactive({
  code: '', title: '', description: '', kind: 'percent-items' as Kind, percent: 10,
  /** What item offers apply to. */
  all: false, categoryIds: [] as CategoryId[], productIds: [] as string[], itemRs: '50',
  maxRs: '', amountRs: '250', minRs: '1500', buy: 2, get: 1, expires: '', audience: 'all' as AdminOffer['audience'], customerIds: [] as string[], branchIds: [] as string[],
  // Conditions
  condMinRs: '', condMinItems: '' as string | number, days: [] as number[], timed: false, fromHour: 18, toHour: 21, starts: '', fulfilment: '' as '' | 'delivery' | 'pickup', limit: '' as string | number,
  announce: false,
})
const error = ref('')

function open(o: AdminOffer | 'new') {
  editing.value = o
  error.value = ''
  const end = new Date(Date.now() + 90 * 864e5)
  end.setHours(23, 59, 0, 0)
  const nextYear = toLocalInput(end)
  if (o === 'new') {
    Object.assign(f, { code: '', title: '', description: '', kind: 'percent-items', percent: 10, all: false, categoryIds: [], productIds: [], itemRs: '50', maxRs: '', amountRs: '250', minRs: '1500', buy: 2, get: 1, expires: nextYear, audience: 'all', customerIds: [], branchIds: auth.isChainLevel.value ? [] : branches.value.map((b) => b.id) })
    Object.assign(f, { condMinRs: '', condMinItems: '', days: [], timed: false, fromHour: 18, toHour: 21, starts: '', fulfilment: '', limit: '', announce: false })
    return
  }
  const c = o.conditions ?? {}
  Object.assign(f, {
    condMinRs: c.minSpendCents ? String(c.minSpendCents / 100) : '', condMinItems: c.minItems ?? '', days: [...(c.days ?? [])],
    timed: c.fromHour !== undefined, fromHour: c.fromHour ?? 18, toHour: c.toHour ?? 21, starts: c.startsAt ? toLocalInput(c.startsAt) : '', fulfilment: c.fulfilment ?? '', limit: c.perCustomerLimit ?? '', announce: !!o.announce,
  })
  const r = o.rule
  const t = ruleTarget(r)
  Object.assign(f, {
    // Older single-category / single-product offers open as "% off selected items".
    code: o.code, title: o.title, description: o.description, kind: r.kind === 'percent-category' || r.kind === 'percent-product' ? 'percent-items' : r.kind,
    all: !!t?.all, categoryIds: [...(t?.categoryIds ?? [])], productIds: [...(t?.productIds ?? [])], itemRs: r.kind === 'amount-items' ? String(r.amountCents / 100) : '50',
    expires: toLocalInput(o.expiresAt), audience: o.audience, customerIds: [...o.customerIds], branchIds: [...o.branchIds],
    percent: 'percent' in r ? r.percent : 10,
    maxRs: (r.kind === 'percent-category' || r.kind === 'percent-items' || r.kind === 'percent-order') && r.maxDiscountCents ? String(r.maxDiscountCents / 100) : '',
    amountRs: r.kind === 'fixed-off' ? String(r.amountCents / 100) : '250',
    minRs: 'minSpendCents' in r ? String(r.minSpendCents / 100) : '1500',
    buy: r.kind === 'bxgy' ? r.buy : 2,
    get: r.kind === 'bxgy' ? r.get : 1,
  })
}

const cents = (rs: string) => Math.round(Number.parseFloat(rs || '0') * 100)
const isItemKind = computed(() => f.kind === 'percent-items' || f.kind === 'amount-items' || f.kind === 'bxgy')
const target = (): ItemTarget => (f.all ? { all: true, categoryIds: [], productIds: [] } : { categoryIds: [...f.categoryIds], productIds: [...f.productIds] })
function buildRule(): OfferRule {
  switch (f.kind) {
    case 'percent-category':
    case 'percent-product':
    case 'percent-items': return { kind: 'percent-items', target: target(), percent: Number(f.percent), maxDiscountCents: f.maxRs ? cents(f.maxRs) : undefined }
    case 'amount-items': return { kind: f.kind, target: target(), amountCents: cents(f.itemRs) }
    case 'bxgy': return { kind: f.kind, target: target(), buy: Number(f.buy), get: Number(f.get) }
    case 'fixed-off': return { kind: f.kind, amountCents: cents(f.amountRs), minSpendCents: cents(f.minRs) }
    case 'free-delivery': return { kind: f.kind, minSpendCents: cents(f.minRs) }
    case 'percent-order': return { kind: f.kind, percent: Number(f.percent), minSpendCents: cents(f.minRs), maxDiscountCents: f.maxRs ? cents(f.maxRs) : undefined }
  }
}

function buildConditions(): OfferConditions | undefined {
  const c: OfferConditions = {}
  if (f.condMinRs) c.minSpendCents = cents(f.condMinRs)
  if (f.condMinItems !== '' && Number(f.condMinItems) > 1) c.minItems = Number(f.condMinItems)
  if (f.days.length && f.days.length < 7) c.days = [...f.days].sort()
  if (f.timed) Object.assign(c, { fromHour: Number(f.fromHour), toHour: Number(f.toHour) })
  const startsAt = fromLocalInput(f.starts)
  if (startsAt && Date.parse(startsAt) > Date.now()) c.startsAt = startsAt
  if (f.fulfilment) c.fulfilment = f.fulfilment
  if (f.limit !== '' && Number(f.limit) > 0) c.perCustomerLimit = Number(f.limit)
  return Object.keys(c).length ? c : undefined
}

/** Live coupon preview of the offer being edited (what shoppers will see). */
const preview = computed(() => ({
  id: 'preview', code: f.code.toUpperCase(), title: f.title || 'Your offer title', description: f.description, rule: buildRule(),
  expiresAt: fromLocalInput(f.expires) ?? '2099-12-31T18:29:00.000Z', conditions: buildConditions(), storeName: auth.user.value?.tenantName ?? undefined,
  storeTheme: myTheme.value, upcoming: !!f.starts && (fromLocalInput(f.starts) ?? '') > new Date().toISOString(),
}))
const hourLabel = (h: number) => `${h % 12 || 12}:00 ${h < 12 || h === 24 ? 'am' : 'pm'}`

// ---- "Applies to" picker
const productQuery = ref('')
const showAllProducts = ref(false)
const pickable = computed(() => {
  const q = productQuery.value.trim().toLowerCase()
  const list = products.value.filter((p) => !p.hidden || f.productIds.includes(p.id))
  const hits = q ? list.filter((p) => `${p.name} ${p.brand} ${categoryName(p.categoryId)}`.toLowerCase().includes(q)) : list
  // Chosen products first so they're easy to untick.
  return [...hits].sort((a, b) => Number(f.productIds.includes(b.id)) - Number(f.productIds.includes(a.id)))
})
const pickableShown = computed(() => (showAllProducts.value || productQuery.value ? pickable.value : pickable.value.slice(0, 8)))
function toggleIn<T>(list: T[], v: T) {
  const i = list.indexOf(v)
  if (i >= 0) list.splice(i, 1)
  else list.push(v)
}
/** Products covered by the chosen categories (already included, shown as such). */
const coveredByCategory = (p: PickProduct) => f.categoryIds.includes(p.categoryId)
const coveredCount = computed(() => (f.all ? products.value.filter((p) => !p.hidden).length : products.value.filter((p) => !p.hidden && (coveredByCategory(p) || f.productIds.includes(p.id))).length))
const targetSummary = computed(() => {
  if (f.all) return `Every product in your store (${coveredCount.value})`
  const parts = []
  if (f.categoryIds.length) parts.push(`${f.categoryIds.length} categor${f.categoryIds.length === 1 ? 'y' : 'ies'}`)
  if (f.productIds.length) parts.push(`${f.productIds.length} product${f.productIds.length === 1 ? '' : 's'}`)
  return parts.length ? `${parts.join(' + ')} · ${coveredCount.value} products in all` : 'Nothing chosen yet'
})

async function save() {
  error.value = ''
  if (isItemKind.value && !f.all && !f.categoryIds.length && !f.productIds.length) {
    error.value = 'Choose what this offer applies to: everything, or some categories / products.'
    return
  }
  const input: OfferInput = { code: f.code, title: f.title, description: f.description, rule: buildRule(), expiresAt: fromLocalInput(f.expires) ?? '', audience: f.audience, customerIds: f.customerIds, branchIds: f.branchIds, conditions: buildConditions(), announce: f.announce }
  const id = editing.value === 'new' ? undefined : editing.value?.id
  try {
    const o = await auth.call((t) => saveOffer(t, input, id))
    offers.value = id ? offers.value.map((x) => (x.id === o.id ? o : x)) : [o, ...offers.value]
    notify.ok(`${o.code} saved`)
    editing.value = null
  } catch (e) {
    error.value = (e as Error).message
  }
}

async function toggle(o: AdminOffer) {
  try {
    const u = await auth.call((t) => setOfferStatus(t, o.id, o.status === 'active' ? 'paused' : 'active'))
    offers.value = offers.value.map((x) => (x.id === u.id ? u : x))
  } catch (e) {
    notify.error(e)
  }
}

async function quick(o: AdminOffer, action: 'publish-now' | 'end-now') {
  if (action === 'end-now') {
    const r = await confirm({ title: `End ${o.code} now?`, message: 'Shoppers stop seeing it straight away. You can publish it again by editing its end time.', confirmLabel: 'End offer now', tone: 'danger' })
    if (!r.ok) return
  }
  try {
    const u = await auth.call((t) => setOfferSchedule(t, o.id, action))
    offers.value = offers.value.map((x) => (x.id === u.id ? u : x))
    notify.ok(action === 'publish-now' ? `${u.code} is live now` : `${u.code} has ended`)
  } catch (e) {
    notify.error(e)
  }
}

/** The supermarket's theme for the coupon preview (same look shoppers get). */
const myTheme = ref<{ logo?: string; primaryColor: string; accentColor: string } | undefined>()
onMounted(async () => {
  try {
    const { getBranding } = await import('~/services/admin/brandingApi')
    const { accentFor } = await import('~/lib/branding')
    if (!auth.can('settings.manage')) return
    const b = await auth.call(getBranding)
    myTheme.value = { logo: b.live.logo, primaryColor: b.live.primaryColor, accentColor: accentFor(b.live) }
  } catch {
    /* preview falls back to the offer-type colours */
  }
})

async function remove(o: AdminOffer) {
  const r = await confirm({ title: `Delete ${o.code}?`, message: 'Customers will no longer receive this offer. This cannot be undone.', confirmLabel: 'Delete offer', tone: 'danger' })
  if (!r.ok) return
  try {
    await auth.call((t) => deleteOffer(t, o.id))
    offers.value = offers.value.filter((x) => x.id !== o.id)
    notify.ok(`${o.code} deleted`)
  } catch (e) {
    notify.error(e)
  }
}
</script>

<template>
  <div>
    <AdminPageHeader title="Promotions" description="Offers show to shoppers at the branches you choose (shelves, product ribbons and the Offers board) and apply automatically in the cart once the conditions are met.">
      <button v-if="canManage" type="button" class="btn-primary h-10" @click="open('new')"><AppIcon name="plus" :size="17" />New offer</button>
    </AdminPageHeader>

    <div class="mb-3 flex flex-wrap gap-2" role="tablist" aria-label="Filter offers by schedule">
      <button v-for="t in TABS" :key="t.id" type="button" role="tab" class="chip ring-1" :class="tab === t.id ? 'bg-hela-green text-white ring-hela-green' : 'bg-white text-ink ring-line'" :aria-selected="tab === t.id" :data-testid="`offers-tab-${t.id}`" @click="tab = t.id">
        {{ t.label }} <span class="opacity-70">{{ counts[t.id] }}</span>
      </button>
    </div>
    <AdminDataTable :rows="shown" :columns="columns" row-key="id" :loading="loading" search-placeholder="Search code or title…">
      <template #cell-code="{ row }">
        <span class="block font-semibold text-ink">{{ row.title }}</span>
        <code class="text-xs font-bold text-hela-gold-600">{{ row.code }}</code>
      </template>
      <template #cell-rule="{ row }"><span class="text-xs text-muted">{{ describe(row) }}</span></template>
      <template #cell-audience="{ row }"><span class="text-xs text-muted">{{ audienceText(row) }}</span></template>
      <template #cell-branches="{ row }"><span class="text-xs text-muted">{{ branchText(row) }}</span></template>
      <template #cell-expiresAt="{ row }"><span class="text-xs text-muted">{{ scheduleText(lifeOf(row)) }}</span><span v-if="row.announce && stateOf(row) === 'scheduled'" class="block text-[0.65rem] font-semibold text-[#6d5622]">Announced as “Coming soon”</span></template>
      <template #cell-status="{ row }"><AdminBadge :value="stateOf(row)" /></template>
      <template #cell-actions="{ row }">
        <span v-if="canManage && row.editable === false" class="text-xs text-muted" title="Runs at other branches too — managed by chain-level admins">Chain offer</span>
        <div v-else-if="canManage" class="flex justify-end gap-1">
          <button type="button" class="btn-ghost h-8 px-2.5 text-xs" @click="open(row)"><AppIcon name="edit" :size="14" />Edit</button>
          <button v-if="stateOf(row) === 'scheduled'" type="button" class="btn-ghost h-8 px-2.5 text-xs whitespace-nowrap text-hela-green" @click="quick(row, 'publish-now')">Publish now</button>
          <button v-if="stateOf(row) === 'live'" type="button" class="btn-ghost h-8 px-2.5 text-xs whitespace-nowrap" @click="quick(row, 'end-now')">End now</button>
          <button v-if="stateOf(row) !== 'ended'" type="button" class="btn-ghost h-8 px-2.5 text-xs" @click="toggle(row)">{{ row.status === 'active' ? 'Pause' : 'Resume' }}</button>
          <button type="button" class="btn-ghost h-8 px-2.5 text-xs text-[#8A2E2E]" :aria-label="`Delete ${row.code}`" @click="remove(row)"><AppIcon name="trash" :size="14" /></button>
        </div>
      </template>
    </AdminDataTable>

    <AdminModal :open="!!editing" :title="editing === 'new' ? 'New offer' : 'Edit offer'" size="xl" @close="editing = null">
      <div class="grid gap-5 lg:grid-cols-[1fr_20rem]">
      <form id="offer-form" class="grid content-start gap-3 sm:grid-cols-2" @submit.prevent="save">
        <label><span class="field-label">Code</span><input v-model="f.code" class="field uppercase" maxlength="16" placeholder="e.g. DRINKS10" data-autofocus></label>
        <label><span class="field-label">Ends at</span><input v-model="f.expires" type="datetime-local" class="field" data-testid="offer-ends"></label>
        <div class="sm:col-span-2 grid gap-3 rounded-xl bg-hela-green-50/60 p-3 sm:grid-cols-2">
          <label><span class="field-label">Publish at <span class="font-normal text-muted">(empty = straight away)</span></span><input v-model="f.starts" type="datetime-local" class="field" data-testid="offer-starts"></label>
          <label class="flex items-start gap-2 pt-6 text-sm" :class="{ 'opacity-50': !f.starts }">
            <input v-model="f.announce" type="checkbox" class="mt-0.5 size-4 accent-hela-green" :disabled="!f.starts" data-testid="offer-announce">
            <span>Announce as “Coming soon”<span class="block text-xs text-muted">Shoppers see it up to 14 days before it starts; it applies only from the publish time.</span></span>
          </label>
        </div>
        <label class="sm:col-span-2"><span class="field-label">Title (shown to customers)</span><input v-model="f.title" class="field" maxlength="80"></label>
        <label class="sm:col-span-2"><span class="field-label">Description</span><input v-model="f.description" class="field" maxlength="200"></label>
        <label class="sm:col-span-2"><span class="field-label">Offer type</span>
          <select v-model="f.kind" class="field">
            <optgroup label="On selected items">
              <option value="percent-items">% off selected items</option>
              <option value="amount-items">Rs. off each selected item</option>
              <option value="bxgy">Buy X, get Y free</option>
            </optgroup>
            <optgroup label="On the whole basket">
            <option value="fixed-off">Amount off above a spend</option>
            <option value="percent-order">% off the whole basket above a spend</option>
            <option value="free-delivery">Free delivery above a spend</option>
            </optgroup>
          </select>
        </label>
        <template v-if="f.kind === 'percent-order'">
          <label><span class="field-label">Discount %</span><input v-model.number="f.percent" type="number" min="1" max="90" class="field"></label>
          <label><span class="field-label">Minimum basket (Rs.)</span><input v-model="f.minRs" class="field" inputmode="decimal"></label>
          <label><span class="field-label">Max discount (Rs., optional)</span><input v-model="f.maxRs" class="field" inputmode="decimal"></label>
        </template>
        <template v-else-if="isItemKind">
          <template v-if="f.kind === 'percent-items'">
            <label><span class="field-label">Discount %</span><input v-model.number="f.percent" type="number" min="1" max="90" class="field" data-testid="offer-percent"></label>
            <label><span class="field-label">Max discount (Rs., optional)</span><input v-model="f.maxRs" class="field" inputmode="decimal"></label>
          </template>
          <label v-else-if="f.kind === 'amount-items'" class="sm:col-span-2"><span class="field-label">Rs. off each item</span><input v-model="f.itemRs" class="field" inputmode="decimal" data-testid="offer-item-rs"></label>
          <template v-else>
            <label><span class="field-label">Buy</span><input v-model.number="f.buy" type="number" min="1" class="field"></label>
            <label><span class="field-label">Get free</span><input v-model.number="f.get" type="number" min="1" class="field"></label>
          </template>

          <!-- Applies to -->
          <fieldset class="sm:col-span-2 rounded-xl p-3 ring-1 ring-line" data-testid="offer-target">
            <legend class="field-label px-1">Applies to</legend>
            <div class="flex flex-wrap gap-2 text-sm" role="radiogroup" aria-label="Applies to">
              <button type="button" role="radio" :aria-checked="!f.all" class="rounded-full px-3 py-1 font-semibold ring-1 transition" :class="!f.all ? 'bg-hela-green text-white ring-hela-green' : 'ring-line hover:bg-hela-green-50'" data-testid="target-selected" @click="f.all = false">Selected categories &amp; products</button>
              <button type="button" role="radio" :aria-checked="f.all" class="rounded-full px-3 py-1 font-semibold ring-1 transition" :class="f.all ? 'bg-hela-green text-white ring-hela-green' : 'ring-line hover:bg-hela-green-50'" data-testid="target-all" @click="f.all = true">Everything in store</button>
            </div>

            <template v-if="!f.all">
              <p class="mt-3 text-xs font-bold text-muted">Categories <span class="font-normal">— every product in them</span></p>
              <div class="mt-1.5 flex flex-wrap gap-1.5">
                <button
                  v-for="c in categories"
                  :key="c.id"
                  type="button"
                  :aria-pressed="f.categoryIds.includes(c.id)"
                  class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 transition"
                  :class="f.categoryIds.includes(c.id) ? 'text-white' : 'bg-white text-ink ring-line hover:ring-hela-green'"
                  :style="f.categoryIds.includes(c.id) ? { background: c.color, '--tw-ring-color': c.color } : undefined"
                  :data-testid="`target-cat-${c.id}`"
                  @click="toggleIn(f.categoryIds, c.id)"
                >
                  <span class="size-2 rounded-full" :style="{ background: f.categoryIds.includes(c.id) ? '#fff' : c.color }" />{{ c.name }}
                  <AppIcon v-if="f.categoryIds.includes(c.id)" name="check" :size="11" :stroke-width="3" />
                </button>
              </div>

              <p class="mt-3 text-xs font-bold text-muted">Products <span class="font-normal">— pick individual items too</span></p>
              <label class="relative mt-1.5 block">
                <span class="sr-only">Search products</span>
                <AppIcon name="search" :size="14" class="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted" />
                <input v-model="productQuery" type="search" class="field h-9 pl-8 text-sm" placeholder="Search by name, brand or category" data-testid="target-product-search">
              </label>
              <ul class="mt-1.5 max-h-56 divide-y divide-line overflow-y-auto rounded-lg ring-1 ring-line">
                <li v-for="p in pickableShown" :key="p.id">
                  <label class="flex cursor-pointer items-center gap-2.5 px-2.5 py-1.5 text-sm hover:bg-hela-green-50/60" :class="{ 'opacity-60': coveredByCategory(p) && !f.productIds.includes(p.id) }">
                    <input type="checkbox" class="size-4 accent-hela-green" :checked="f.productIds.includes(p.id) || coveredByCategory(p)" :disabled="coveredByCategory(p) && !f.productIds.includes(p.id)" :data-testid="`target-prod-${p.id}`" @change="toggleIn(f.productIds, p.id)">
                    <span class="min-w-0 flex-1 truncate"><b class="font-semibold text-ink">{{ p.name }}</b> <span class="text-xs text-muted">{{ p.brand }} · {{ p.size }}</span></span>
                    <span class="shrink-0 text-[0.65rem] text-muted">{{ coveredByCategory(p) && !f.productIds.includes(p.id) ? 'in a chosen category' : categoryName(p.categoryId) }}</span>
                  </label>
                </li>
                <li v-if="!pickable.length" class="px-2.5 py-3 text-center text-xs text-muted">{{ products.length ? `No product matches “${productQuery}”.` : 'No products yet.' }}</li>
              </ul>
              <button v-if="!productQuery && pickable.length > pickableShown.length" type="button" class="mt-1 text-xs font-bold text-hela-green hover:underline" @click="showAllProducts = true">Show all {{ pickable.length }} products</button>
            </template>

            <p class="mt-3 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold" :class="f.all || f.categoryIds.length || f.productIds.length ? 'bg-hela-green-50 text-hela-green' : 'bg-hela-gold-100/70 text-[#6d5622]'" data-testid="target-summary">
              <AppIcon name="tag" :size="12" />{{ targetSummary }}
              <button v-if="!f.all && (f.categoryIds.length || f.productIds.length)" type="button" class="ml-auto font-bold underline" @click="f.categoryIds = []; f.productIds = []">Clear</button>
            </p>
          </fieldset>
        </template>
        <template v-else>
          <label v-if="f.kind === 'fixed-off'"><span class="field-label">Discount (Rs.)</span><input v-model="f.amountRs" class="field" inputmode="decimal"></label>
          <label><span class="field-label">Minimum spend (Rs.)</span><input v-model="f.minRs" class="field" inputmode="decimal"></label>
        </template>
        <fieldset v-if="branches.length > 1 || !auth.isChainLevel.value" class="sm:col-span-2">
          <legend class="field-label">Runs at</legend>
          <div class="flex flex-wrap gap-3 text-sm">
            <label v-if="auth.isChainLevel.value" class="flex items-center gap-2"><input type="checkbox" class="accent-hela-green" :checked="!f.branchIds.length" @change="f.branchIds = []"> All branches</label>
            <label v-for="b in branches" :key="b.id" class="flex items-center gap-2"><input v-model="f.branchIds" type="checkbox" :value="b.id" class="accent-hela-green"> {{ b.name }}</label>
          </div>
        </fieldset>
        <fieldset class="sm:col-span-2">
          <legend class="field-label">Who gets it</legend>
          <div class="flex flex-wrap gap-3 text-sm">
            <label class="flex items-center gap-2"><input v-model="f.audience" type="radio" value="all" class="accent-hela-green"> All customers</label>
            <label class="flex items-center gap-2"><input v-model="f.audience" type="radio" value="new" class="accent-hela-green"> New customers</label>
            <label class="flex items-center gap-2"><input v-model="f.audience" type="radio" value="selected" class="accent-hela-green" :disabled="!customers.length"> Selected customers</label>
          </div>
          <div v-if="f.audience === 'selected'" class="mt-2 max-h-40 overflow-y-auto rounded-lg bg-white p-2 ring-1 ring-line">
            <label v-for="c in customers" :key="c.id" class="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-hela-green-50">
              <input v-model="f.customerIds" type="checkbox" :value="c.id" class="accent-hela-green"> {{ c.name }} <span class="text-xs text-muted">{{ c.email }}</span>
            </label>
          </div>
        </fieldset>
        <fieldset class="rounded-xl bg-cream/60 p-3 sm:col-span-2" data-testid="offer-conditions">
          <legend class="px-1 text-sm font-bold text-ink">Conditions <span class="font-normal text-muted">(optional; all must be met)</span></legend>
          <div class="grid gap-3 sm:grid-cols-3">
            <label><span class="field-label">Minimum spend (Rs.)</span><input v-model="f.condMinRs" class="field" inputmode="decimal" placeholder="e.g. 5000" data-testid="cond-min-spend"></label>
            <label><span class="field-label">Minimum items</span><input v-model="f.condMinItems" type="number" min="2" class="field" placeholder="e.g. 3"></label>
            <label><span class="field-label">Uses per customer</span><input v-model="f.limit" type="number" min="1" max="50" class="field" placeholder="Unlimited"></label>
            <label><span class="field-label">Order type</span>
              <select v-model="f.fulfilment" class="field"><option value="">Delivery &amp; pickup</option><option value="delivery">Home delivery only</option><option value="pickup">Store pickup only</option></select>
            </label>
            <div>
              <label class="field-label flex items-center gap-2"><input v-model="f.timed" type="checkbox" class="accent-hela-green"> Time window</label>
              <div v-if="f.timed" class="flex items-center gap-1.5">
                <select v-model.number="f.fromHour" class="field px-2 text-xs" aria-label="From"><option v-for="h in 24" :key="h - 1" :value="h - 1">{{ hourLabel(h - 1) }}</option></select>
                <span class="text-xs text-muted">to</span>
                <select v-model.number="f.toHour" class="field px-2 text-xs" aria-label="To"><option v-for="h in 24" :key="h" :value="h">{{ hourLabel(h) }}</option></select>
              </div>
              <p v-else class="text-xs text-muted">All day</p>
            </div>
            <div class="sm:col-span-3">
              <span class="field-label">Days <span class="font-normal text-muted">(none ticked = every day)</span></span>
              <div class="flex flex-wrap items-center gap-1.5">
                <label v-for="(d, i) in DAYS" :key="d" class="cursor-pointer rounded-lg px-2.5 py-1.5 text-xs font-bold ring-1 transition" :class="f.days.includes(i) ? 'bg-hela-green text-white ring-hela-green' : 'bg-white text-ink ring-line'">
                  <input v-model="f.days" type="checkbox" :value="i" class="sr-only">{{ d }}
                </label>
                <button type="button" class="ml-1 text-xs font-bold text-hela-green hover:underline" @click="f.days = [0, 6]">Weekends</button>
              </div>
            </div>
          </div>
        </fieldset>
        <p v-if="error" class="text-sm text-[#8A2E2E] sm:col-span-2" role="alert">{{ error }}</p>
      </form>
      <aside class="space-y-2 lg:sticky lg:top-0 lg:self-start">
        <p class="text-xs font-bold tracking-wide text-muted uppercase">Shopper preview</p>
        <OfferCard :offer="preview" />
        <p class="text-xs text-muted">Shown on the Offers board, product ribbons and shelf tags at {{ f.branchIds.length ? `${f.branchIds.length} branch${f.branchIds.length === 1 ? '' : 'es'}` : 'all branches' }}, for {{ f.audience === 'all' ? 'all customers' : f.audience === 'new' ? 'new customers' : 'the selected customers' }}.</p>
      </aside>
      </div>
      <template #footer>
        <button type="button" class="btn-ghost h-9" @click="editing = null">Cancel</button>
        <button type="submit" form="offer-form" class="btn-primary h-9">Save offer</button>
      </template>
    </AdminModal>
  </div>
</template>
