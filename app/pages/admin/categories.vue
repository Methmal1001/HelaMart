<script setup lang="ts">
import type { IconName, StoreAreaId } from '~/types'
import type { AdminCategory, AdminProduct } from '~/types/admin'
import { STANDARD_CATEGORIES, STORE_AREAS } from '~/data/categories'
import { sections } from '~/data/storeLayout'
import {
  categoryIconChoices,
  createCategory,
  deleteCategory,
  listCategories,
  listProducts,
  moveCategory,
  restoreStandardCategory,
  updateCategory,
  type CategoryInput,
} from '~/services/admin/tenantApi'

definePageMeta({ layout: 'admin', middleware: 'admin', scope: 'tenant', permission: 'products.view' })
useHead({ title: 'Categories' })

const auth = useAdminAuth()
const notify = useAdminNotify()
const cats = ref<AdminCategory[]>([])
const products = ref<AdminProduct[]>([])
const loading = ref(true)
const canManage = computed(() => auth.can('categories.manage') && !auth.readOnly.value)

async function load() {
  try {
    ;[cats.value, products.value] = await Promise.all([auth.call(listCategories), auth.call(listProducts)])
  } catch (e) {
    notify.error(e)
  } finally {
    loading.value = false
  }
}
onMounted(load)

const countFor = (id: string) => products.value.filter((p) => p.categoryId === id).length
const removedStandard = computed(() => STANDARD_CATEGORIES.filter((s) => !cats.value.some((c) => c.id === s.id)))
/** Store areas with no visible category: their shelves are empty in the 3D store. */
const emptyAreas = computed(() => (loading.value ? [] : STORE_AREAS.filter((a) => !cats.value.some((c) => c.area === a && c.visible))))

/** "Aisle 3 · Beverages area" — where a store area is in the 3D store. */
function areaLabel(area: StoreAreaId) {
  const s = sections.find((x) => x.categoryId === area)
  const std = STANDARD_CATEGORIES.find((x) => x.area === area)!
  return `${s?.aisle ? `${s.aisle} · ` : ''}${std.name} area`
}
/** Other categories sharing an area. */
const sharing = (c: AdminCategory) => cats.value.filter((x) => x.area === c.area && x.id !== c.id)

// ---- add / edit
const editing = ref<AdminCategory | 'new' | null>(null)
const form = reactive<CategoryInput>({ name: '', description: '', color: '#174D38', visible: true, icon: 'tag', area: 'household' })
const error = ref('')
const saving = ref(false)
function open(c: AdminCategory | 'new') {
  editing.value = c
  error.value = ''
  if (c === 'new') Object.assign(form, { name: '', description: '', color: '#2F7D57', visible: true, icon: 'basket', area: 'household' })
  else Object.assign(form, { name: c.name, description: c.description, color: c.color, visible: c.visible, icon: c.icon, area: c.area })
}
async function save() {
  error.value = ''
  saving.value = true
  try {
    const input = { ...form }
    if (editing.value === 'new') {
      const c = await auth.call((t) => createCategory(t, input))
      notify.ok(`${c.name} added — shoppers see it now`)
    } else if (editing.value) {
      const id = editing.value.id
      const c = await auth.call((t) => updateCategory(t, id, input))
      notify.ok(`${c.name} saved`)
    }
    editing.value = null
    await load()
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    saving.value = false
  }
}

async function move(c: AdminCategory, dir: -1 | 1) {
  try {
    cats.value = await auth.call((t) => moveCategory(t, c.id, dir))
  } catch (e) {
    notify.error(e)
  }
}

// ---- remove
const removing = ref<AdminCategory | null>(null)
const removeForm = reactive({ mode: 'move' as 'move' | 'hide', moveTo: '' })
function startRemove(c: AdminCategory) {
  removing.value = c
  error.value = ''
  removeForm.mode = 'move'
  removeForm.moveTo = cats.value.find((x) => x.id !== c.id && x.area === c.area)?.id ?? cats.value.find((x) => x.id !== c.id)?.id ?? ''
}
async function confirmRemove() {
  const c = removing.value
  if (!c) return
  error.value = ''
  saving.value = true
  try {
    const has = countFor(c.id) > 0
    const opts = !has ? {} : removeForm.mode === 'move' ? { moveTo: removeForm.moveTo } : { hideProducts: true }
    const r = await auth.call((t) => deleteCategory(t, c.id, opts), 'Removing a category needs your password confirmed.')
    notify.ok(r.moved ? `${c.name} removed — ${r.moved} products moved` : r.hidden ? `${c.name} removed — ${r.hidden} products hidden` : `${c.name} removed`)
    removing.value = null
    await load()
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    saving.value = false
  }
}
async function restore(id: string) {
  try {
    const c = await auth.call((t) => restoreStandardCategory(t, id))
    notify.ok(`${c.name} is back in your store`)
    await load()
  } catch (e) {
    notify.error(e)
  }
}

const ICON_LABEL: Partial<Record<IconName, string>> = { apple: 'Fresh', bread: 'Bakery', milk: 'Dairy', snowflake: 'Frozen', bottle: 'Drinks', cookie: 'Snacks', wheat: 'Grains', spray: 'Cleaning', sparkle: 'Care', home: 'Home', basket: 'Basket', gift: 'Gifts', tag: 'General', package: 'Packaged', cart: 'Cart', store: 'Store' }
</script>

<template>
  <div>
    <AdminPageHeader title="Categories" description="Your store’s sections. Names, colours, order and what’s shown update the shop right away: aisle list, filters, product pages and the signs in the 3D store.">
      <button v-if="canManage" type="button" class="btn-primary h-10" data-testid="add-category" @click="open('new')"><AppIcon name="plus" :size="17" />Add category</button>
    </AdminPageHeader>

    <p v-if="emptyAreas.length" class="mb-4 flex gap-2 rounded-2xl bg-[#FFF4D6] p-3.5 text-sm text-[#5c4300]" role="status" data-testid="empty-areas">
      <AppIcon name="alert" :size="16" class="mt-0.5 shrink-0" />
      <span><b>Empty shelves in your 3D store:</b> {{ emptyAreas.map(areaLabel).join(', ') }}. Shoppers see a “Coming soon” sign there — add a category to that area (or add back the standard one).</span>
    </p>
    <p v-if="loading" class="text-sm text-muted">Loading categories…</p>
    <ol class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <li v-for="(c, i) in cats" :key="c.id" class="card flex items-start gap-3 p-4" :class="{ 'opacity-70': !c.visible }" :data-testid="`category-${c.id}`">
        <span class="grid size-10 shrink-0 place-items-center rounded-xl text-white" :style="{ background: c.color }" aria-hidden="true"><AppIcon :name="c.icon" :size="18" /></span>
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-1.5">
            <h2 class="truncate font-bold text-ink">{{ c.name }}</h2>
            <AdminBadge :value="c.visible ? 'active' : 'hidden'" :label="c.visible ? 'Visible' : 'Hidden'" />
            <span class="rounded-md px-1.5 py-0.5 text-[0.65rem] font-bold" :class="c.standard ? 'bg-cream text-muted' : 'bg-hela-gold-100 text-[#6d5622]'">{{ c.standard ? 'Standard' : 'Your category' }}</span>
          </div>
          <p class="mt-1 line-clamp-2 text-xs text-muted">{{ c.description || '—' }}</p>
          <p class="mt-2 text-xs"><b class="text-ink">{{ countFor(c.id) }} products</b> <span class="text-muted">· {{ areaLabel(c.area) }}</span></p>
          <p v-if="sharing(c).length" class="text-[0.7rem] text-muted">Shares its shelves with {{ sharing(c).map((x) => x.name).join(', ') }}</p>
        </div>
        <div v-if="canManage" class="flex shrink-0 flex-col items-end gap-1">
          <button type="button" class="btn-ghost h-8 px-2.5 text-xs" :aria-label="`Edit ${c.name}`" @click="open(c)"><AppIcon name="edit" :size="14" />Edit</button>
          <div class="flex">
            <button type="button" class="grid size-7 place-items-center rounded-md text-muted hover:bg-cream disabled:opacity-30" :disabled="i === 0" :aria-label="`Move ${c.name} up`" @click="move(c, -1)"><AppIcon name="arrow-left" :size="13" class="rotate-90" /></button>
            <button type="button" class="grid size-7 place-items-center rounded-md text-muted hover:bg-cream disabled:opacity-30" :disabled="i === cats.length - 1" :aria-label="`Move ${c.name} down`" @click="move(c, 1)"><AppIcon name="arrow-right" :size="13" class="rotate-90" /></button>
            <button type="button" class="grid size-7 place-items-center rounded-md text-[#8A2E2E] hover:bg-[#FBEAEA]" :aria-label="`Remove ${c.name}`" :data-testid="`remove-${c.id}`" @click="startRemove(c)"><AppIcon name="trash" :size="13" /></button>
          </div>
        </div>
      </li>
    </ol>

    <section v-if="canManage && removedStandard.length" class="mt-6">
      <h2 class="text-sm font-bold text-ink">Standard categories you removed</h2>
      <div class="mt-2 flex flex-wrap gap-2">
        <button v-for="s in removedStandard" :key="s.id" type="button" class="chip bg-white text-ink ring-1 ring-line hover:bg-hela-green-50" @click="restore(s.id)">
          <span class="size-2 rounded-full" :style="{ background: s.color }" />{{ s.name }} <span class="text-hela-green">· Add back</span>
        </button>
      </div>
    </section>

    <!-- Add / edit -->
    <AdminModal :open="!!editing" :title="editing === 'new' ? 'Add a category' : `Edit ${form.name}`" size="md" @close="editing = null">
      <form id="cat-form" class="space-y-3" @submit.prevent="save">
        <div class="flex items-center gap-3 rounded-xl bg-cream p-3">
          <span class="grid size-11 place-items-center rounded-xl text-white" :style="{ background: form.color }"><AppIcon :name="form.icon" :size="20" /></span>
          <div class="min-w-0">
            <p class="truncate font-bold text-ink">{{ form.name || 'Category name' }}</p>
            <p class="text-xs text-muted">Shown in the aisle list, filters and 3D signs</p>
          </div>
        </div>
        <label class="block"><span class="field-label">Name</span><input v-model="form.name" class="field" maxlength="40" placeholder="e.g. Baby Care" data-autofocus data-testid="cat-name"></label>
        <label class="block"><span class="field-label">Description</span><textarea v-model="form.description" rows="2" maxlength="200" class="field h-auto py-2" /></label>
        <label class="block">
          <span class="field-label">Shelved in (3D store area)</span>
          <select v-model="form.area" class="field" data-testid="cat-area">
            <option v-for="a in STORE_AREAS" :key="a" :value="a">{{ areaLabel(a) }}</option>
          </select>
          <span class="mt-1 block text-xs text-muted">Its products go on these shelves, and the area’s signs show its name.</span>
        </label>
        <div>
          <span class="field-label">Icon</span>
          <div class="grid grid-cols-8 gap-1.5">
            <button v-for="ic in categoryIconChoices" :key="ic" type="button" class="grid aspect-square place-items-center rounded-lg ring-1 transition" :class="form.icon === ic ? 'bg-hela-green text-white ring-hela-green' : 'bg-white text-ink ring-line hover:bg-hela-green-50'" :aria-label="ICON_LABEL[ic] ?? ic" :aria-pressed="form.icon === ic" @click="form.icon = ic"><AppIcon :name="ic" :size="16" /></button>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-5">
          <label class="flex items-center gap-3 text-sm"><span class="field-label mb-0">Colour</span><input v-model="form.color" type="color" class="h-9 w-14 rounded border-0"></label>
          <label class="flex items-center gap-2 text-sm"><input v-model="form.visible" type="checkbox" class="size-4 accent-hela-green"> Visible in the shop</label>
        </div>
        <p v-if="error" class="text-sm text-[#8A2E2E]" role="alert">{{ error }}</p>
      </form>
      <template #footer>
        <button type="button" class="btn-ghost h-9" @click="editing = null">Cancel</button>
        <button type="submit" form="cat-form" class="btn-primary h-9" :disabled="saving" data-testid="cat-save">{{ editing === 'new' ? 'Add category' : 'Save' }}</button>
      </template>
    </AdminModal>

    <!-- Remove -->
    <AdminModal :open="!!removing" :title="`Remove ${removing?.name ?? ''}?`" size="sm" @close="removing = null">
      <div v-if="removing" class="space-y-3 text-sm">
        <p class="text-muted">It disappears from the shop’s aisle list, filters and signs.<template v-if="removing.standard"> You can add it back later.</template></p>
        <template v-if="countFor(removing.id)">
          <p class="font-semibold text-ink">It has {{ countFor(removing.id) }} products. What should happen to them?</p>
          <label class="flex items-start gap-2"><input v-model="removeForm.mode" type="radio" value="move" class="mt-1 accent-hela-green">
            <span class="flex-1">Move them to
              <select v-model="removeForm.moveTo" class="field mt-1" :disabled="removeForm.mode !== 'move'" data-testid="remove-move-to">
                <option v-for="c in cats.filter((x) => x.id !== removing!.id)" :key="c.id" :value="c.id">{{ c.name }}</option>
              </select>
              <span class="mt-1 block text-xs text-muted">Offers on this category move with them.</span>
            </span>
          </label>
          <label class="flex items-start gap-2"><input v-model="removeForm.mode" type="radio" value="hide" class="mt-1 accent-hela-green"><span>Hide them from the shop <span class="block text-xs text-muted">Its offers are paused.</span></span></label>
        </template>
        <p v-if="error" class="text-sm text-[#8A2E2E]" role="alert">{{ error }}</p>
      </div>
      <template #footer>
        <button type="button" class="btn-ghost h-9" @click="removing = null">Cancel</button>
        <button type="button" class="btn-primary h-9 bg-[#8A2E2E] hover:bg-[#6f2323]" :disabled="saving" data-testid="remove-confirm" @click="confirmRemove">Remove category</button>
      </template>
    </AdminModal>
  </div>
</template>
