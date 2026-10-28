<script setup lang="ts">
import type { AdminProduct, TableColumn } from '~/types/admin'
import type { CategoryId, ProductShape } from '~/types'
import { categories, getCategory } from '~/data/categories'
import { adjustStock, branchDirectory, createProduct, listProducts, setProductStatus, updateProduct, type ProductInput } from '~/services/admin/tenantApi'

definePageMeta({ layout: 'admin', middleware: 'admin', scope: 'tenant', permission: 'products.view' })
useHead({ title: 'Products & stock' })

const auth = useAdminAuth()
const notify = useAdminNotify()
const route = useRoute()
const products = ref<AdminProduct[]>([])
const branches = ref<{ id: string; name: string }[]>([])
const branch = ref('all')
const loading = ref(true)
const filter = ref<'all' | 'low' | 'out' | 'hidden'>(route.query.filter === 'low' ? 'low' : 'all')
const canEdit = computed(() => auth.can('products.manage') && !auth.readOnly.value)
const canStock = computed(() => auth.can('inventory.manage') && !auth.readOnly.value)

async function load() {
  loading.value = true
  try {
    ;[products.value, branches.value] = await Promise.all([auth.call(listProducts), auth.call(branchDirectory)])
    if (branches.value.length === 1) branch.value = branches.value[0]!.id
  } catch (e) {
    notify.error(e)
  } finally {
    loading.value = false
  }
}
onMounted(load)

/** Stock at the selected branch, or the total across the branches you can see. */
const stockOf = (p: AdminProduct) => (branch.value === 'all' ? Object.values(p.stock).reduce((s, n) => s + n, 0) : (p.stock[branch.value] ?? 0))
/** Out = nothing anywhere you look; Low = a branch is empty or at/below the reorder level. */
const levelsOf = (p: AdminProduct) => (branch.value === 'all' ? Object.values(p.stock) : [p.stock[branch.value] ?? 0])
const stockState = (p: AdminProduct) => {
  const levels = levelsOf(p)
  if (levels.every((n) => n === 0)) return 'out_of_stock'
  return levels.some((n) => n <= p.reorderLevel) ? 'low_stock' : 'in_stock'
}
const stockLabel = (p: AdminProduct) => {
  const state = stockState(p)
  if (state === 'in_stock') return 'OK'
  if (state === 'out_of_stock') return 'Out'
  const empty = levelsOf(p).filter((n) => n === 0).length
  return empty ? `Out at ${empty} branch${empty === 1 ? '' : 'es'}` : 'Low'
}
const rows = computed(() =>
  products.value.filter((p) =>
    filter.value === 'low' ? stockState(p) !== 'in_stock' : filter.value === 'out' ? levelsOf(p).some((n) => n === 0) : filter.value === 'hidden' ? p.status === 'hidden' : true,
  ),
)
const columns: TableColumn[] = [
  { key: 'name', label: 'Product', sortable: true, value: (p: AdminProduct) => `${p.name} ${p.brand}` },
  { key: 'categoryId', label: 'Category', sortable: true, value: (p: AdminProduct) => getCategory(p.categoryId).shortName },
  { key: 'priceCents', label: 'Price', sortable: true, align: 'right' },
  { key: 'stock', label: 'Stock', sortable: true, align: 'right', value: (p: AdminProduct) => stockOf(p) },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'actions', label: '', align: 'right', value: () => '' },
]

// ---- create / edit
const SHAPES: ProductShape[] = ['box', 'tallBox', 'bottle', 'can', 'jar', 'bag', 'carton', 'tray', 'loaf', 'round', 'long', 'roll']
const editing = ref<AdminProduct | 'new' | null>(null)
const form = reactive({ name: '', brand: '', categoryId: 'staples' as CategoryId, size: '', unit: 'pack', price: '', description: '', shape: 'box' as ProductShape, color: '#174D38', accent: '#E1C987', badge: '' as '' | NonNullable<AdminProduct['badge']>, reorderLevel: 12 })
const formError = ref('')
const saving = ref(false)

function openEdit(p: AdminProduct | 'new') {
  editing.value = p
  formError.value = ''
  if (p === 'new') Object.assign(form, { name: '', brand: '', categoryId: 'staples', size: '', unit: 'pack', price: '', description: '', shape: 'box', color: '#174D38', accent: '#E1C987', badge: '', reorderLevel: 12 })
  else Object.assign(form, { ...p, price: (p.priceCents / 100).toFixed(2), badge: p.badge ?? '' })
}

async function save() {
  formError.value = ''
  const input: ProductInput = {
    name: form.name, brand: form.brand, categoryId: form.categoryId, size: form.size, unit: form.unit,
    priceCents: Math.round(Number.parseFloat(form.price) * 100), description: form.description, shape: form.shape,
    color: form.color, accent: form.accent, badge: form.badge || undefined, reorderLevel: Math.floor(Number(form.reorderLevel)),
  }
  saving.value = true
  try {
    if (editing.value === 'new') {
      const p = await auth.call((t) => createProduct(t, input))
      products.value = [p, ...products.value]
      notify.ok(`${p.name} added to every branch — receive stock to start selling`)
    } else if (editing.value) {
      const id = editing.value.id
      const p = await auth.call((t) => updateProduct(t, id, input))
      products.value = products.value.map((x) => (x.id === p.id ? { ...p, stock: x.stock } : x))
      notify.ok(`${p.name} saved`)
    }
    editing.value = null
  } catch (e) {
    formError.value = (e as Error).message
  } finally {
    saving.value = false
  }
}

async function toggleStatus(p: AdminProduct) {
  try {
    const u = await auth.call((t) => setProductStatus(t, p.id, p.status === 'active' ? 'hidden' : 'active'))
    products.value = products.value.map((x) => (x.id === u.id ? { ...u, stock: x.stock } : x))
    notify.ok(u.status === 'hidden' ? `${u.name} hidden from shoppers` : `${u.name} is visible again`)
  } catch (e) {
    notify.error(e)
  }
}

// ---- stock adjustment (always for one branch)
const stockFor = ref<AdminProduct | null>(null)
const stockForm = reactive({ branchId: '', mode: 'add' as 'add' | 'remove', qty: 1, reason: 'Delivery received' })
const stockError = ref('')
function openStock(p: AdminProduct) {
  stockFor.value = p
  stockError.value = ''
  Object.assign(stockForm, { branchId: branch.value !== 'all' ? branch.value : (branches.value[0]?.id ?? ''), mode: 'add', qty: 1, reason: 'Delivery received' })
}
async function saveStock() {
  if (!stockFor.value) return
  const delta = (stockForm.mode === 'add' ? 1 : -1) * Math.floor(Number(stockForm.qty))
  const id = stockFor.value.id
  try {
    const u = await auth.call((t) => adjustStock(t, id, stockForm.branchId, delta, stockForm.reason))
    products.value = products.value.map((x) => (x.id === u.id ? u : x))
    notify.ok(`${u.name}: ${branches.value.find((b) => b.id === stockForm.branchId)?.name} now has ${u.stock[stockForm.branchId]}`)
    stockFor.value = null
  } catch (e) {
    stockError.value = (e as Error).message
  }
}
</script>

<template>
  <div>
    <AdminPageHeader title="Products & stock" :description="auth.isChainLevel.value ? 'Chain-wide catalogue and prices, with stock held at each branch.' : 'Your branch’s stock. Prices are set by the chain.'">
      <button v-if="canEdit" type="button" class="btn-primary h-10" @click="openEdit('new')"><AppIcon name="plus" :size="17" />Add product</button>
    </AdminPageHeader>

    <AdminDataTable :rows="rows" :columns="columns" row-key="id" :loading="loading" search-placeholder="Search products or brands…" :initial-sort="{ key: 'name', dir: 'asc' }">
      <template #toolbar>
        <select v-if="branches.length > 1" v-model="branch" class="field w-auto" aria-label="Branch">
          <option value="all">All branches (total)</option>
          <option v-for="b in branches" :key="b.id" :value="b.id">{{ b.name }}</option>
        </select>
        <select v-model="filter" class="field w-auto" aria-label="Filter products">
          <option value="all">All products</option>
          <option value="low">Low or out of stock</option>
          <option value="out">Out of stock</option>
          <option value="hidden">Hidden</option>
        </select>
      </template>
      <template #cell-name="{ row }">
        <div class="flex items-center gap-3">
          <ProductThumb :product="row" class="size-10 shrink-0" rounded="rounded-lg" />
          <span class="min-w-0"><span class="block truncate font-semibold text-ink">{{ row.name }}</span><span class="block truncate text-xs text-muted">{{ row.brand }} · {{ row.size }}</span></span>
        </div>
      </template>
      <template #cell-categoryId="{ row }"><span class="text-muted">{{ getCategory(row.categoryId).shortName }}</span></template>
      <template #cell-priceCents="{ row }"><span class="font-semibold tabular-nums">{{ formatLKR(row.priceCents) }}</span></template>
      <template #cell-stock="{ row }">
        <span class="inline-flex items-center gap-2" :title="branches.map((b) => `${b.name}: ${row.stock[b.id] ?? 0}`).join('\n')">
          <span class="tabular-nums">{{ stockOf(row) }}</span>
          <AdminBadge :value="stockState(row)" :label="stockLabel(row)" />
        </span>
      </template>
      <template #cell-status="{ row }"><AdminBadge :value="row.status" /></template>
      <template #cell-actions="{ row }">
        <div class="flex justify-end gap-1">
          <button v-if="canStock" type="button" class="btn-ghost h-8 px-2.5 text-xs" :aria-label="`Adjust stock for ${row.name}`" @click="openStock(row)"><AppIcon name="package" :size="14" />Stock</button>
          <button v-if="canEdit" type="button" class="btn-ghost h-8 px-2.5 text-xs" :aria-label="`Edit ${row.name}`" @click="openEdit(row)"><AppIcon name="edit" :size="14" />Edit</button>
          <button v-if="canEdit" type="button" class="btn-ghost h-8 px-2.5 text-xs" :aria-label="row.status === 'active' ? `Hide ${row.name}` : `Show ${row.name}`" @click="toggleStatus(row)">
            <AppIcon :name="row.status === 'active' ? 'eye-off' : 'eye'" :size="14" />
          </button>
        </div>
      </template>
    </AdminDataTable>

    <AdminModal :open="!!editing" :title="editing === 'new' ? 'Add product' : 'Edit product'" description="Product details and price apply to every branch." size="lg" @close="editing = null">
      <form id="product-form" class="grid gap-3 sm:grid-cols-2" @submit.prevent="save">
        <label class="sm:col-span-2"><span class="field-label">Name</span><input v-model="form.name" class="field" maxlength="80" data-autofocus required></label>
        <label><span class="field-label">Brand</span><input v-model="form.brand" class="field" maxlength="60"></label>
        <label><span class="field-label">Category</span><select v-model="form.categoryId" class="field"><option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option></select></label>
        <label><span class="field-label">Price (LKR)</span><input v-model="form.price" class="field" inputmode="decimal" placeholder="0.00" required></label>
        <label><span class="field-label">Pack size</span><input v-model="form.size" class="field" placeholder="e.g. 1 kg"></label>
        <label><span class="field-label">Sold per</span><input v-model="form.unit" class="field" placeholder="pack, bottle, per kg"></label>
        <label><span class="field-label">Badge</span><select v-model="form.badge" class="field"><option value="">None</option><option>Fresh</option><option>Local</option><option>New</option><option>Popular</option></select></label>
        <label><span class="field-label">Reorder level (per branch)</span><input v-model.number="form.reorderLevel" type="number" min="0" class="field"></label>
        <label class="sm:col-span-2"><span class="field-label">Description</span><textarea v-model="form.description" rows="2" maxlength="300" class="field h-auto py-2" /></label>
        <fieldset class="grid grid-cols-3 gap-3 sm:col-span-2">
          <legend class="field-label">3D package (used on the shelves)</legend>
          <label><span class="sr-only">Shape</span><select v-model="form.shape" class="field" aria-label="Package shape"><option v-for="s in SHAPES" :key="s" :value="s">{{ s }}</option></select></label>
          <label class="flex items-center gap-2 text-xs">Colour <input v-model="form.color" type="color" class="h-9 w-12 rounded border-0"></label>
          <label class="flex items-center gap-2 text-xs">Label <input v-model="form.accent" type="color" class="h-9 w-12 rounded border-0"></label>
        </fieldset>
        <p v-if="formError" class="text-sm text-[#8A2E2E] sm:col-span-2" role="alert">{{ formError }}</p>
      </form>
      <template #footer>
        <button type="button" class="btn-ghost h-9" @click="editing = null">Cancel</button>
        <button type="submit" form="product-form" class="btn-primary h-9" :disabled="saving">{{ saving ? 'Saving…' : 'Save product' }}</button>
      </template>
    </AdminModal>

    <AdminModal :open="!!stockFor" :title="`Adjust stock — ${stockFor?.name ?? ''}`" size="sm" @close="stockFor = null">
      <form id="stock-form" class="space-y-3" @submit.prevent="saveStock">
        <label class="block"><span class="field-label">Branch</span>
          <select v-model="stockForm.branchId" class="field">
            <option v-for="b in branches" :key="b.id" :value="b.id">{{ b.name }} — {{ stockFor?.stock[b.id] ?? 0 }} in stock</option>
          </select>
        </label>
        <div class="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Adjustment type">
          <button type="button" role="radio" :aria-checked="stockForm.mode === 'add'" class="btn h-9 ring-1" :class="stockForm.mode === 'add' ? 'bg-hela-green text-white ring-hela-green' : 'bg-white ring-line'" @click="stockForm.mode = 'add'">Add stock</button>
          <button type="button" role="radio" :aria-checked="stockForm.mode === 'remove'" class="btn h-9 ring-1" :class="stockForm.mode === 'remove' ? 'bg-hela-green text-white ring-hela-green' : 'bg-white ring-line'" @click="stockForm.mode = 'remove'">Remove stock</button>
        </div>
        <label class="block"><span class="field-label">Quantity</span><input v-model.number="stockForm.qty" type="number" min="1" class="field" data-autofocus></label>
        <label class="block"><span class="field-label">Reason</span>
          <select v-model="stockForm.reason" class="field"><option>Delivery received</option><option>Stock count correction</option><option>Damaged / expired</option><option>Returned by customer</option><option>Transfer between branches</option></select>
        </label>
        <p v-if="stockError" class="text-sm text-[#8A2E2E]" role="alert">{{ stockError }}</p>
      </form>
      <template #footer>
        <button type="button" class="btn-ghost h-9" @click="stockFor = null">Cancel</button>
        <button type="submit" form="stock-form" class="btn-primary h-9">Save adjustment</button>
      </template>
    </AdminModal>
  </div>
</template>
