<script setup lang="ts">
import type { CategoryId } from '~/types'
import { categories } from '~/data/categories'
import { products } from '~/data/products'
import { sectionForCategory } from '~/data/storeLayout'

/**
 * Accessible, non-3D way to browse every aisle and add to cart.
 * Used in the in-store drawer and on the standalone /browse page.
 */
const props = withDefaults(defineProps<{ compact?: boolean; canLocate?: boolean }>(), { compact: false, canLocate: false })
const emit = defineEmits<{ locate: [productId: string] }>()

const { add, quantityOf } = useCart()
const { openProduct } = useStoreUi()
const { show } = useToasts()

const query = ref('')
const active = ref<CategoryId | 'all'>('all')

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  return products.filter(
    (p) =>
      (active.value === 'all' || p.categoryId === active.value) &&
      (!q || `${p.name} ${p.brand} ${p.description}`.toLowerCase().includes(q)),
  )
})

const grouped = computed(() =>
  categories
    .map((c) => ({ category: c, items: filtered.value.filter((p) => p.categoryId === c.id) }))
    .filter((g) => g.items.length),
)

function quickAdd(id: string, name: string) {
  add(id, 1)
  show(`Added ${name} to cart`, 'success')
}

function aisleLabel(categoryId: CategoryId) {
  const s = sectionForCategory(categoryId)
  return s?.aisle ?? ''
}
</script>

<template>
  <div>
    <div class="sticky top-0 z-10 space-y-3 bg-warm-white/95 px-5 pt-4 pb-3 backdrop-blur" :class="compact ? '' : 'sm:px-0'">
      <label class="relative block">
        <span class="sr-only">Search products</span>
        <AppIcon name="search" :size="18" class="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted" />
        <input
          v-model="query"
          type="search"
          placeholder="Search rice, tea, milk…"
          class="h-11 w-full rounded-xl border-0 bg-white pr-4 pl-10 text-sm text-ink ring-1 ring-line placeholder:text-muted/80 focus:ring-2 focus:ring-hela-green focus:outline-none"
          data-autofocus
        >
      </label>
      <div class="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]" :class="compact ? '' : 'sm:mx-0 sm:flex-wrap sm:px-0'" role="group" aria-label="Filter by aisle">
        <button
          type="button"
          class="chip shrink-0 ring-1 transition"
          :class="active === 'all' ? 'bg-hela-green text-white ring-hela-green' : 'bg-white text-ink ring-line hover:bg-hela-green-50'"
          :aria-pressed="active === 'all'"
          @click="active = 'all'"
        >All aisles</button>
        <button
          v-for="c in categories"
          :key="c.id"
          type="button"
          class="chip shrink-0 ring-1 transition"
          :class="active === c.id ? 'bg-hela-green text-white ring-hela-green' : 'bg-white text-ink ring-line hover:bg-hela-green-50'"
          :aria-pressed="active === c.id"
          @click="active = c.id"
        >
          <span class="size-2 rounded-full" :style="{ background: c.color }" aria-hidden="true" />
          {{ c.shortName }}
        </button>
      </div>
    </div>

    <div class="px-5 pb-8" :class="compact ? '' : 'sm:px-0'">
      <p v-if="!grouped.length" class="py-16 text-center text-sm text-muted">No products match “{{ query }}”.</p>

      <section v-for="g in grouped" :key="g.category.id" class="mt-5" :aria-labelledby="`cat-${g.category.id}`">
        <div class="mb-3 flex items-end justify-between gap-2">
          <h3 :id="`cat-${g.category.id}`" class="flex items-center gap-2 text-base font-bold text-ink">
            <span class="grid size-8 place-items-center rounded-lg text-white" :style="{ background: g.category.color }">
              <AppIcon :name="g.category.icon" :size="16" />
            </span>
            {{ g.category.name }}
          </h3>
          <span class="text-xs font-semibold text-muted">{{ aisleLabel(g.category.id) }}</span>
        </div>

        <ul class="grid gap-3" :class="compact ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'">
          <li v-for="p in g.items" :key="p.id" class="flex gap-3 rounded-2xl bg-white p-3 ring-1 ring-line transition hover:shadow-card">
            <button type="button" class="shrink-0" :aria-label="`View details for ${p.name}`" @click="openProduct(p.id)">
              <ProductThumb :product="p" class="size-20" />
            </button>
            <div class="flex min-w-0 flex-1 flex-col">
              <button type="button" class="truncate text-left text-sm font-bold text-ink hover:text-hela-green" @click="openProduct(p.id)">
                {{ p.name }}
              </button>
              <p class="truncate text-xs text-muted">{{ p.brand }} · {{ p.size }}</p>
              <div class="mt-auto flex items-center justify-between gap-2 pt-2">
                <span class="text-sm font-extrabold tabular-nums text-hela-green">{{ formatLKR(p.priceCents) }}</span>
                <div class="flex items-center gap-1.5">
                  <button
                    v-if="props.canLocate"
                    type="button"
                    class="grid size-9 place-items-center rounded-lg text-muted ring-1 ring-line transition hover:bg-hela-green-50 hover:text-hela-green"
                    :aria-label="`Show ${p.name} in the store`"
                    title="Show in store"
                    @click="emit('locate', p.id)"
                  >
                    <AppIcon name="pin" :size="16" />
                  </button>
                  <button
                    type="button"
                    class="flex h-9 items-center gap-1 rounded-lg bg-hela-green px-3 text-xs font-bold text-white transition hover:bg-hela-green-900"
                    :aria-label="`Add ${p.name} to cart`"
                    @click="quickAdd(p.id, p.name)"
                  >
                    <AppIcon name="plus" :size="14" />
                    Add
                    <span v-if="quantityOf(p.id)" class="ml-0.5 rounded bg-hela-gold px-1 text-[0.65rem] text-hela-green-900">{{ quantityOf(p.id) }}</span>
                  </button>
                </div>
              </div>
            </div>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
