<script setup lang="ts">
import type { AdminOffer, Customer, TableColumn } from '~/types/admin'
import type { CategoryId, OfferRule } from '~/types'
import { categories, getCategory } from '~/data/categories'
import { products, getProduct } from '~/data/products'
import { deleteOffer, listCustomers, listOffers, saveOffer, setOfferStatus, type OfferInput } from '~/services/admin/api'

definePageMeta({ layout: 'admin', middleware: 'admin', permission: 'promotions.view' })
useHead({ title: 'Promotions' })

const auth = useAdminAuth()
const notify = useAdminNotify()
const { confirm } = useAdminConfirm()
const offers = ref<AdminOffer[]>([])
const customers = ref<Customer[]>([])
const loading = ref(true)
const canManage = computed(() => auth.can('promotions.manage'))

onMounted(async () => {
  try {
    offers.value = await auth.call(listOffers)
    if (auth.can('customers.view')) customers.value = await auth.call(listCustomers)
  } catch (e) {
    notify.error(e)
  } finally {
    loading.value = false
  }
})

function describe(rule: OfferRule) {
  switch (rule.kind) {
    case 'percent-category': return `${rule.percent}% off ${getCategory(rule.categoryId).name}${rule.maxDiscountCents ? ` (max ${formatLKR(rule.maxDiscountCents)})` : ''}`
    case 'percent-product': return `${rule.percent}% off ${getProduct(rule.productId)?.name ?? rule.productId}`
    case 'bxgy': return `Buy ${rule.buy} get ${rule.get} free${rule.categoryId ? ` · ${getCategory(rule.categoryId).name}` : ''}`
    case 'fixed-off': return `${formatLKR(rule.amountCents)} off over ${formatLKR(rule.minSpendCents)}`
    case 'free-delivery': return `Free delivery over ${formatLKR(rule.minSpendCents)}`
  }
}
const expired = (o: AdminOffer) => Date.parse(o.expiresAt) < Date.now()
const audienceText = (o: AdminOffer) => (o.audience === 'all' ? 'All customers' : o.audience === 'new' ? 'New customers' : `${o.customerIds.length} selected`)

const columns: TableColumn[] = [
  { key: 'code', label: 'Offer', sortable: true, value: (o: AdminOffer) => `${o.code} ${o.title}` },
  { key: 'rule', label: 'Rule', value: (o: AdminOffer) => describe(o.rule) },
  { key: 'audience', label: 'Audience', value: (o: AdminOffer) => audienceText(o) },
  { key: 'usageCount', label: 'Used', sortable: true, align: 'right' },
  { key: 'expiresAt', label: 'Expires', sortable: true },
  { key: 'status', label: 'Status', value: (o: AdminOffer) => (expired(o) ? 'expired' : o.status) },
  { key: 'actions', label: '', align: 'right', value: () => '' },
]

// ---- editor
type Kind = OfferRule['kind']
const editing = ref<AdminOffer | 'new' | null>(null)
const f = reactive({
  code: '', title: '', description: '', kind: 'percent-category' as Kind, percent: 10, categoryId: 'beverages' as CategoryId, productId: products[0]!.id,
  maxRs: '', amountRs: '250', minRs: '1500', buy: 2, get: 1, expires: '', audience: 'all' as AdminOffer['audience'], customerIds: [] as string[],
})
const error = ref('')

function open(o: AdminOffer | 'new') {
  editing.value = o
  error.value = ''
  const nextYear = new Date(Date.now() + 90 * 864e5).toISOString().slice(0, 10)
  if (o === 'new') {
    Object.assign(f, { code: '', title: '', description: '', kind: 'percent-category', percent: 10, categoryId: 'beverages', productId: products[0]!.id, maxRs: '', amountRs: '250', minRs: '1500', buy: 2, get: 1, expires: nextYear, audience: 'all', customerIds: [] })
    return
  }
  const r = o.rule
  Object.assign(f, {
    code: o.code, title: o.title, description: o.description, kind: r.kind, expires: o.expiresAt.slice(0, 10), audience: o.audience, customerIds: [...o.customerIds],
    percent: 'percent' in r ? r.percent : 10,
    categoryId: 'categoryId' in r && r.categoryId ? r.categoryId : 'beverages',
    productId: r.kind === 'percent-product' ? r.productId : products[0]!.id,
    maxRs: r.kind === 'percent-category' && r.maxDiscountCents ? String(r.maxDiscountCents / 100) : '',
    amountRs: r.kind === 'fixed-off' ? String(r.amountCents / 100) : '250',
    minRs: 'minSpendCents' in r ? String(r.minSpendCents / 100) : '1500',
    buy: r.kind === 'bxgy' ? r.buy : 2,
    get: r.kind === 'bxgy' ? r.get : 1,
  })
}

const cents = (rs: string) => Math.round(Number.parseFloat(rs || '0') * 100)
function buildRule(): OfferRule {
  switch (f.kind) {
    case 'percent-category': return { kind: f.kind, categoryId: f.categoryId, percent: Number(f.percent), maxDiscountCents: f.maxRs ? cents(f.maxRs) : undefined }
    case 'percent-product': return { kind: f.kind, productId: f.productId, percent: Number(f.percent) }
    case 'bxgy': return { kind: f.kind, categoryId: f.categoryId, buy: Number(f.buy), get: Number(f.get) }
    case 'fixed-off': return { kind: f.kind, amountCents: cents(f.amountRs), minSpendCents: cents(f.minRs) }
    case 'free-delivery': return { kind: f.kind, minSpendCents: cents(f.minRs) }
  }
}

async function save() {
  error.value = ''
  const input: OfferInput = { code: f.code, title: f.title, description: f.description, rule: buildRule(), expiresAt: `${f.expires}T23:59:59+05:30`, audience: f.audience, customerIds: f.customerIds }
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
    <AdminPageHeader title="Promotions" description="Offers are applied automatically at checkout for the customers they target.">
      <button v-if="canManage" type="button" class="btn-primary h-10" @click="open('new')"><AppIcon name="plus" :size="17" />New offer</button>
    </AdminPageHeader>

    <AdminDataTable :rows="offers" :columns="columns" row-key="id" :loading="loading" search-placeholder="Search code or title…">
      <template #cell-code="{ row }">
        <span class="block font-semibold text-ink">{{ row.title }}</span>
        <code class="text-xs font-bold text-hela-gold-600">{{ row.code }}</code>
      </template>
      <template #cell-rule="{ row }"><span class="text-xs text-muted">{{ describe(row.rule) }}</span></template>
      <template #cell-audience="{ row }"><span class="text-xs text-muted">{{ audienceText(row) }}</span></template>
      <template #cell-expiresAt="{ row }"><span class="text-xs text-muted">{{ row.expiresAt.slice(0, 10) }}</span></template>
      <template #cell-status="{ row }"><AdminBadge :value="expired(row) ? 'expired' : row.status" /></template>
      <template #cell-actions="{ row }">
        <div v-if="canManage" class="flex justify-end gap-1">
          <button type="button" class="btn-ghost h-8 px-2.5 text-xs" @click="open(row)"><AppIcon name="edit" :size="14" />Edit</button>
          <button type="button" class="btn-ghost h-8 px-2.5 text-xs" @click="toggle(row)">{{ row.status === 'active' ? 'Pause' : 'Resume' }}</button>
          <button type="button" class="btn-ghost h-8 px-2.5 text-xs text-[#8A2E2E]" :aria-label="`Delete ${row.code}`" @click="remove(row)"><AppIcon name="trash" :size="14" /></button>
        </div>
      </template>
    </AdminDataTable>

    <AdminModal :open="!!editing" :title="editing === 'new' ? 'New offer' : 'Edit offer'" size="lg" @close="editing = null">
      <form id="offer-form" class="grid gap-3 sm:grid-cols-2" @submit.prevent="save">
        <label><span class="field-label">Code</span><input v-model="f.code" class="field uppercase" maxlength="16" placeholder="e.g. DRINKS10" data-autofocus></label>
        <label><span class="field-label">Expires on</span><input v-model="f.expires" type="date" class="field"></label>
        <label class="sm:col-span-2"><span class="field-label">Title (shown to customers)</span><input v-model="f.title" class="field" maxlength="80"></label>
        <label class="sm:col-span-2"><span class="field-label">Description</span><input v-model="f.description" class="field" maxlength="200"></label>
        <label class="sm:col-span-2"><span class="field-label">Offer type</span>
          <select v-model="f.kind" class="field">
            <option value="percent-category">% off a category</option>
            <option value="percent-product">% off one product</option>
            <option value="bxgy">Buy X, get Y free</option>
            <option value="fixed-off">Amount off above a spend</option>
            <option value="free-delivery">Free delivery above a spend</option>
          </select>
        </label>
        <template v-if="f.kind === 'percent-category' || f.kind === 'percent-product'">
          <label><span class="field-label">Discount %</span><input v-model.number="f.percent" type="number" min="1" max="90" class="field"></label>
          <label v-if="f.kind === 'percent-category'"><span class="field-label">Category</span><select v-model="f.categoryId" class="field"><option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option></select></label>
          <label v-else><span class="field-label">Product</span><select v-model="f.productId" class="field"><option v-for="p in products" :key="p.id" :value="p.id">{{ p.name }}</option></select></label>
          <label v-if="f.kind === 'percent-category'"><span class="field-label">Max discount (Rs., optional)</span><input v-model="f.maxRs" class="field" inputmode="decimal"></label>
        </template>
        <template v-else-if="f.kind === 'bxgy'">
          <label><span class="field-label">Buy</span><input v-model.number="f.buy" type="number" min="1" class="field"></label>
          <label><span class="field-label">Get free</span><input v-model.number="f.get" type="number" min="1" class="field"></label>
          <label class="sm:col-span-2"><span class="field-label">Category</span><select v-model="f.categoryId" class="field"><option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option></select></label>
        </template>
        <template v-else>
          <label v-if="f.kind === 'fixed-off'"><span class="field-label">Discount (Rs.)</span><input v-model="f.amountRs" class="field" inputmode="decimal"></label>
          <label><span class="field-label">Minimum spend (Rs.)</span><input v-model="f.minRs" class="field" inputmode="decimal"></label>
        </template>
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
        <p v-if="error" class="text-sm text-[#8A2E2E] sm:col-span-2" role="alert">{{ error }}</p>
      </form>
      <template #footer>
        <button type="button" class="btn-ghost h-9" @click="editing = null">Cancel</button>
        <button type="submit" form="offer-form" class="btn-primary h-9">Save offer</button>
      </template>
    </AdminModal>
  </div>
</template>
