<script setup lang="ts">
const { itemCount } = useCart()
const { openPanel } = useStoreUi()
const { hasEntered } = useStoreExperience()
const bill = useBill()
</script>

<template>
  <header class="sticky top-0 z-30 border-b border-line bg-warm-white/95 backdrop-blur">
    <div class="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
      <NuxtLink to="/" aria-label="HelaMart home — enter the 3D store">
        <BrandLogo size="sm" tagline />
      </NuxtLink>
      <nav class="flex items-center gap-2" aria-label="Main">
        <NuxtLink to="/" class="btn-ghost hidden h-10 md:inline-flex">
          <AppIcon name="door" :size="17" />
          {{ hasEntered ? 'Back to 3D store' : 'Enter 3D store' }}
        </NuxtLink>
        <NuxtLink to="/browse" class="btn-ghost h-10" active-class="!bg-hela-green-50 !ring-hela-green/30">
          <AppIcon name="list" :size="17" />
          <span class="hidden sm:inline">Aisles</span>
        </NuxtLink>
        <AccountButton compact />
        <button type="button" class="btn-primary relative h-10" :aria-label="`Open cart, ${itemCount} items`" @click="openPanel('cart')">
          <AppIcon name="cart" :size="18" />
          <span class="hidden tabular-nums sm:inline">{{ formatLKR(bill.itemsTotalCents) }}</span>
          <span
            v-if="itemCount"
            class="absolute -top-1.5 -right-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-hela-gold px-1 text-[0.68rem] font-extrabold text-hela-green-900 ring-2 ring-white"
          >{{ itemCount > 99 ? '99+' : itemCount }}</span>
        </button>
      </nav>
    </div>
  </header>
</template>
