<script setup lang="ts">
useHead({ title: 'Your cart — HelaMart' })

const { items, itemCount, clear } = useCart()
const { show } = useToasts()
const { startCheckout } = useCheckout()
const { isAuthenticated } = useAuth()

function clearCart() {
  clear()
  show('Cart cleared')
}
</script>

<template>
  <div class="min-h-dvh bg-warm-white">
    <SiteHeader />
    <main class="mx-auto max-w-6xl px-4 pt-8 pb-16 sm:px-6">
      <NuxtLink to="/" class="inline-flex items-center gap-1.5 text-sm font-semibold text-hela-green hover:underline">
        <AppIcon name="arrow-left" :size="16" />
        Back to the store
      </NuxtLink>
      <h1 class="mt-3 text-3xl font-extrabold tracking-[-0.04em] text-hela-green">Your cart</h1>
      <p class="mt-1 text-sm text-muted">{{ itemCount }} {{ itemCount === 1 ? 'item' : 'items' }} · sample products and illustrative prices</p>

      <div v-if="!items.length" class="mt-10 rounded-3xl bg-white p-10 text-center ring-1 ring-line">
        <div class="mx-auto mb-4 grid size-16 place-items-center rounded-2xl bg-hela-green-50 text-hela-green">
          <AppIcon name="basket" :size="30" />
        </div>
        <p class="font-bold text-ink">Your cart is empty</p>
        <p class="mt-1 text-sm text-muted">Walk the aisles in 3D or browse the list to add groceries.</p>
        <div class="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
          <NuxtLink to="/" class="btn-primary">Enter the 3D store</NuxtLink>
          <NuxtLink to="/browse" class="btn-ghost">Browse aisles</NuxtLink>
        </div>
      </div>

      <div v-else class="mt-8 grid gap-6 lg:grid-cols-[1fr_22rem] lg:items-start">
        <section class="rounded-3xl bg-white px-5 ring-1 ring-line" aria-label="Cart items">
          <ul class="divide-y divide-line">
            <CartLineItem v-for="line in items" :key="line.productId" :line="line" />
          </ul>
          <div class="flex justify-end border-t border-line py-3">
            <button type="button" class="text-sm font-semibold text-muted hover:text-[#8A2E2E]" @click="clearCart">Clear cart</button>
          </div>
        </section>

        <aside class="rounded-3xl bg-white p-6 ring-1 ring-line lg:sticky lg:top-24" aria-labelledby="summary-h">
          <h2 id="summary-h" class="mb-4 text-base font-bold text-ink">Order summary</h2>
          <CartSummary />
          <button type="button" class="btn-primary mt-6 h-12 w-full" @click="startCheckout()">
            <AppIcon :name="isAuthenticated ? 'receipt' : 'lock'" :size="18" />
            {{ isAuthenticated ? 'Proceed to checkout' : 'Log in to checkout' }}
          </button>
          <p class="mt-3 flex gap-2 rounded-xl bg-hela-gold-100 p-3 text-xs leading-relaxed text-[#6d5622]">
            <AppIcon name="info" :size="16" class="mt-px shrink-0" />
            Prototype checkout: orders and payments are simulated with test data — no real charges are made.
          </p>
        </aside>
      </div>
    </main>
  </div>
</template>
