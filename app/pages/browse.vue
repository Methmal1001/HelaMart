<script setup lang="ts">
useHead({ title: 'Browse aisles — HelaMart' })

const xp = useStoreExperience()
const { openPanel } = useStoreUi()
const { storeOffers } = useOffers()

/** Open the 3D store and walk straight to the product. */
async function locate(productId: string) {
  xp.pendingProductId.value = productId
  await navigateTo('/')
}
</script>

<template>
  <div class="min-h-dvh bg-warm-white">
    <SiteHeader />
    <main class="mx-auto max-w-7xl px-0 pb-16 sm:px-6">
      <div class="px-5 pt-8 pb-2 sm:px-0">
        <p class="eyebrow">All aisles</p>
        <h1 class="mt-2 text-3xl font-extrabold tracking-[-0.04em] text-hela-green sm:text-4xl">Browse HelaMart</h1>
        <p class="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
          Every section of the store in one accessible list. Add items here, or use
          <AppIcon name="pin" :size="14" class="inline align-[-2px]" /> to walk to a product in the 3D store.
          All products and prices are fictional samples for this prototype.
        </p>
        <div class="mt-4 flex flex-wrap items-start gap-3">
          <div class="w-full max-w-md"><StorePicker /></div>
          <button type="button" class="relative flex h-12 items-center gap-2 rounded-xl bg-white px-4 text-sm font-bold text-ink ring-1 ring-line transition hover:ring-[#E23B3B]" data-testid="browse-offers" @click="openPanel('offers')">
            <AppIcon name="gift" :size="18" class="text-[#C2361A]" />Offers
            <span v-if="storeOffers.length" class="grid min-w-5 place-items-center rounded-full bg-[#E23B3B] px-1 text-[0.7rem] text-white">{{ storeOffers.length }}</span>
          </button>
        </div>
        <div class="mt-5"><HomeBanners variant="hero" /></div>
      </div>
      <CatalogBrowser can-locate @locate="locate" />
    </main>
  </div>
</template>
