<script setup lang="ts">
import type { AdminCategory, AdminProduct } from '~/types/admin'
import { listCategories, listProducts, updateCategory } from '~/services/admin/tenantApi'

definePageMeta({ layout: 'admin', middleware: 'admin', scope: 'tenant', permission: 'products.view' })
useHead({ title: 'Categories' })

const auth = useAdminAuth()
const notify = useAdminNotify()
const cats = ref<AdminCategory[]>([])
const products = ref<AdminProduct[]>([])
const editing = ref<AdminCategory | null>(null)
const form = reactive({ name: '', description: '', color: '#174D38', visible: true })
const error = ref('')

onMounted(async () => {
  try {
    ;[cats.value, products.value] = await Promise.all([auth.call(listCategories), auth.call(listProducts)])
  } catch (e) {
    notify.error(e)
  }
})

const countFor = (id: string) => products.value.filter((p) => p.categoryId === id).length
function open(c: AdminCategory) {
  editing.value = c
  error.value = ''
  Object.assign(form, c)
}
async function save() {
  if (!editing.value) return
  const id = editing.value.id
  try {
    const u = await auth.call((t) => updateCategory(t, id, { ...form }))
    cats.value = cats.value.map((c) => (c.id === u.id ? u : c))
    notify.ok(`${u.name} saved`)
    editing.value = null
  } catch (e) {
    error.value = (e as Error).message
  }
}
</script>

<template>
  <div>
    <AdminPageHeader title="Categories" description="Store sections shown on signs, the minimap and the aisle list." />
    <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <article v-for="c in cats" :key="c.id" class="card flex items-start gap-3 p-4">
        <span class="mt-1 size-4 shrink-0 rounded-full" :style="{ background: c.color }" aria-hidden="true" />
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <h2 class="truncate font-bold text-ink">{{ c.name }}</h2>
            <AdminBadge :value="c.visible ? 'active' : 'hidden'" :label="c.visible ? 'Visible' : 'Hidden'" />
          </div>
          <p class="mt-1 text-xs text-muted">{{ c.description }}</p>
          <p class="mt-2 text-xs font-semibold text-ink">{{ countFor(c.id) }} products</p>
        </div>
        <button v-if="auth.can('categories.manage') && !auth.readOnly.value" type="button" class="btn-ghost h-8 px-2.5 text-xs" :aria-label="`Edit ${c.name}`" @click="open(c)"><AppIcon name="edit" :size="14" />Edit</button>
      </article>
    </div>

    <AdminModal :open="!!editing" :title="`Edit ${editing?.name ?? ''}`" size="sm" @close="editing = null">
      <form id="cat-form" class="space-y-3" @submit.prevent="save">
        <label class="block"><span class="field-label">Name</span><input v-model="form.name" class="field" maxlength="60" data-autofocus></label>
        <label class="block"><span class="field-label">Description</span><textarea v-model="form.description" rows="2" maxlength="200" class="field h-auto py-2" /></label>
        <label class="flex items-center gap-3 text-sm"><span class="field-label mb-0">Sign colour</span><input v-model="form.color" type="color" class="h-9 w-14 rounded border-0"></label>
        <label class="flex items-center gap-2 text-sm"><input v-model="form.visible" type="checkbox" class="size-4 accent-hela-green"> Visible in the store</label>
        <p v-if="error" class="text-sm text-[#8A2E2E]" role="alert">{{ error }}</p>
      </form>
      <template #footer>
        <button type="button" class="btn-ghost h-9" @click="editing = null">Cancel</button>
        <button type="submit" form="cat-form" class="btn-primary h-9">Save</button>
      </template>
    </AdminModal>
  </div>
</template>
