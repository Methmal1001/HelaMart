<script setup lang="ts">
import { catalogVersion, getProduct } from '~/data/products'
import { getCategory } from '~/data/categories'

const { selectedProductId, closeProduct, openPanel } = useStoreUi()
const { add, quantityOf } = useCart()
const { show } = useToasts()
const { phase, goToProduct } = useStoreExperience()
const route = useRoute()

const product = computed(() => {
  void catalogVersion.value
  return selectedProductId.value ? getProduct(selectedProductId.value) ?? null : null
})
const outOfStock = computed(() => product.value?.stock === 0)
const maxQty = computed(() => (product.value?.stock !== undefined ? Math.max(1, product.value.stock) : 99))
const category = computed(() => (product.value ? getCategory(product.value.categoryId) : null))
const quantity = ref(1)
const added = ref(false)
const inCart = computed(() => (product.value ? quantityOf(product.value.id) : 0))

watch(selectedProductId, () => {
  quantity.value = 1
  added.value = false
})

function addToCart() {
  if (!product.value) return
  const qty = Math.min(quantity.value, maxQty.value)
  if (!add(product.value.id, qty)) {
    show(`Sorry — ${product.value.name} is out of stock at this branch.`, 'error')
    return
  }
  added.value = true
  show(`Added ${qty} × ${product.value.name} to cart`, 'success')
}

function viewCart() {
  closeProduct()
  openPanel('cart')
}

async function findInStore() {
  if (!product.value) return
  const id = product.value.id
  closeProduct()
  if (route.path === '/' && phase.value === 'inside') await goToProduct(id)
}
</script>

<template>
  <SidePanel :open="!!product" :title="product?.name ?? 'Product'" width="sm:max-w-[26rem]" @close="closeProduct">
    <template #subtitle>
      <p v-if="category" class="text-xs text-muted">{{ category.name }}</p>
    </template>

    <div v-if="product" class="px-5 py-5">
      <ProductThumb :product="product" class="aspect-[4/3] w-full" rounded="rounded-2xl" />

      <div class="mt-5 flex flex-wrap items-center gap-2">
        <span v-if="product.badge" class="chip bg-hela-green text-hela-gold">{{ product.badge }}</span>
        <span class="chip bg-hela-green-50 text-hela-green">{{ product.brand }}</span>
        <span class="chip bg-white text-muted ring-1 ring-line">{{ product.size }} · per {{ product.unit.replace('per ', '') }}</span>
      </div>

      <p class="mt-4 text-3xl font-extrabold tracking-tight tabular-nums text-hela-green">{{ formatLKR(product.priceCents) }}</p>
      <p class="mt-2 text-sm leading-relaxed text-muted">{{ product.description }}</p>
      <p v-if="outOfStock" class="mt-3 flex items-center gap-1.5 rounded-lg bg-[#FBEAEA] px-3 py-2 text-sm font-semibold text-[#8A2E2E]">
        <AppIcon name="alert" :size="15" />Out of stock at this branch
      </p>
      <p v-else-if="product.stock !== undefined && product.stock <= 5" class="mt-3 text-sm font-semibold text-[#7A5600]">Only {{ product.stock }} left at this branch</p>
      <p class="mt-3 flex items-center gap-1.5 text-xs text-muted">
        <AppIcon name="info" :size="14" />
        {{ product.image ? 'Photo supplied by the supermarket.' : 'Sample product — photo coming soon.' }} Prices are illustrative.
      </p>

      <div class="mt-6 flex items-center gap-3">
        <QuantityStepper v-model="quantity" :label="product.name" />
        <button type="button" class="btn-primary h-11 flex-1" data-autofocus :disabled="outOfStock" @click="addToCart">
          <AppIcon :name="added ? 'check' : 'cart'" :size="18" />
          <template v-if="outOfStock">Out of stock</template>
          <template v-else>{{ added ? 'Add again' : 'Add to cart' }} · {{ formatLKR(product.priceCents * quantity) }}</template>
        </button>
      </div>

      <Transition enter-active-class="transition duration-300" enter-from-class="opacity-0 -translate-y-1">
        <div v-if="added" class="mt-4 flex items-center justify-between gap-3 rounded-xl bg-hela-green-50 px-4 py-3 text-sm">
          <span class="flex items-center gap-2 font-semibold text-hela-green">
            <AppIcon name="check" :size="16" />
            {{ inCart }} in your cart
          </span>
          <button type="button" class="font-bold text-hela-green underline-offset-4 hover:underline" @click="viewCart">View cart</button>
        </div>
      </Transition>

      <button
        v-if="route.path === '/' && phase === 'inside'"
        type="button"
        class="btn-ghost mt-3 w-full"
        @click="findInStore"
      >
        <AppIcon name="pin" :size="16" />
        Show me where it is
      </button>
    </div>
  </SidePanel>
</template>
