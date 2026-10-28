<script setup lang="ts">
const { panel, closePanel } = useStoreUi()
const { items, itemCount } = useCart()
const { startCheckout } = useCheckout()
const { isAuthenticated } = useAuth()

const open = computed(() => panel.value === 'cart')

async function review() {
  closePanel()
  await navigateTo('/cart')
}
</script>

<template>
  <SidePanel :open="open" title="Your cart" @close="closePanel">
    <template #subtitle>
      <p class="text-xs text-muted">{{ itemCount }} {{ itemCount === 1 ? 'item' : 'items' }} · sample prices</p>
    </template>

    <div v-if="!items.length" class="flex flex-col items-center px-8 py-16 text-center">
      <div class="mb-4 grid size-16 place-items-center rounded-2xl bg-hela-green-50 text-hela-green">
        <AppIcon name="basket" :size="30" />
      </div>
      <p class="font-bold text-ink">Your cart is empty</p>
      <p class="mt-1 text-sm text-muted">Click any product on the shelves, or browse the aisles list, to add it here.</p>
      <button type="button" class="btn-primary mt-6" data-autofocus @click="closePanel">Continue shopping</button>
    </div>

    <ul v-else class="divide-y divide-line px-5">
      <CartLineItem v-for="line in items" :key="line.productId" :line="line" />
    </ul>

    <template v-if="items.length" #footer>
      <CartSummary />
      <button type="button" class="btn-primary mt-4 h-12 w-full" @click="startCheckout()">
        <AppIcon :name="isAuthenticated ? 'receipt' : 'lock'" :size="18" />
        {{ isAuthenticated ? 'Checkout' : 'Log in to checkout' }}
      </button>
      <div class="mt-2 grid grid-cols-2 gap-2">
        <button type="button" class="btn-ghost" @click="closePanel">Keep shopping</button>
        <button type="button" class="btn-ghost" @click="review">
          Full cart
          <AppIcon name="arrow-right" :size="16" />
        </button>
      </div>
    </template>
  </SidePanel>
</template>
