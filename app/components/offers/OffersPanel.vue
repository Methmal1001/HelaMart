<script setup lang="ts">
import type { CategoryId } from '~/types'
import { getProduct, productsInCategory } from '~/data/products'
import { getCategory } from '~/data/categories'
import { textOn } from '~/lib/branding'

/**
 * "Offers" drawer: the chosen branch's running offers as coupons, which ones
 * already apply to the cart, and how close the shopper is to unlocking the rest.
 */
const { panel, closePanel, openPanel } = useStoreUi()
const { storeOffers: allStoreOffers, offers: personal } = useOffers()
/** Running now vs. announced ("Coming soon"). */
const storeOffers = computed(() => allStoreOffers.value.filter((o) => !o.upcoming))
const comingSoon = computed(() => allStoreOffers.value.filter((o) => o.upcoming))
const { isAuthenticated } = useAuth()
const { choice, currentStore } = useStoreSelection()
const bill = useBill()
const route = useRoute()
const xp = useStoreExperience()
const { show } = useToasts()

const open = computed(() => panel.value === 'offers')
const appliedIds = computed(() => new Set(bill.value.applied.map((a) => a.offer.id)))
const hints = computed(() => new Map(bill.value.unmet.map((u) => [u.offer.id, u.hint])))
const personalOnly = computed(() => (isAuthenticated.value ? personal.value.filter((p) => isOfferActive(p) && !storeOffers.value.some((s) => s.id === p.id || s.code === p.code)) : []))

/** Progress toward spend-based offers ("Rs. 1,200 more to unlock …"). */
function progress(o: (typeof storeOffers.value)[number]) {
  const r = o.rule
  const target = o.conditions?.minSpendCents ?? ('minSpendCents' in r ? r.minSpendCents : 0)
  if (!target) return null
  const have = o.conditions?.minSpendCents ? bill.value.subtotalCents : bill.value.subtotalCents - bill.value.itemDiscountCents
  return Math.min(100, Math.round((have / target) * 100))
}

/** Item offers point at a place in the store: that product, or that category's aisle. */
function categoryOf(o: (typeof storeOffers.value)[number]): CategoryId | null {
  const r = o.rule
  return r.kind === 'percent-category' || (r.kind === 'bxgy' && r.categoryId) ? (r.categoryId as CategoryId) : null
}
function targetOf(o: (typeof storeOffers.value)[number]): { productId: string; place: string } | null {
  const r = o.rule
  if (r.kind === 'percent-product') {
    const p = getProduct(r.productId)
    return p && p.stock !== 0 ? { productId: p.id, place: p.name } : null
  }
  if (r.kind === 'bxgy' && r.productIds?.length) {
    const p = r.productIds.map((id) => getProduct(id)).find((x) => x && x.stock !== 0)
    if (p) return { productId: p.id, place: p.name }
  }
  const cat = categoryOf(o)
  if (!cat) return null
  // Prefer a product the offer actually discounts, in stock at this branch.
  const p = productsInCategory(cat).find((x) => x.stock !== 0)
  return p ? { productId: p.id, place: `${getCategory(cat).name} aisle` } : null
}

/**
 * Take the shopper to the offer inside HelaMart's 3D store. Already inside →
 * walk there now. Otherwise open the store: the shopper picks an avatar,
 * enters, and is walked to the offer's aisle.
 */
async function shop(o: (typeof storeOffers.value)[number]) {
  const target = targetOf(o)
  if (!target) return
  const label = `${o.title} · ${target.place}`
  closePanel()
  if (route.path === '/' && xp.phase.value === 'inside') {
    await xp.goToProduct(target.productId)
    show(`Here you are: ${label}`, 'success', 4500)
    return
  }
  xp.pendingProductId.value = target.productId
  xp.pendingLabel.value = label
  if (route.path !== '/') await navigateTo('/')
}
</script>

<template>
  <SidePanel :open="open" title="Offers" width="sm:max-w-[28rem]" @close="closePanel">
    <template #subtitle>
      <p class="text-xs text-muted">{{ choice ? `${choice.storeName} · ${choice.branchName}` : 'Choose a supermarket to see its offers' }}</p>
    </template>
    <!-- The supermarket's own look: logo, theme colour and slogan -->
    <div
      v-if="currentStore"
      class="flex items-center gap-3 px-5 py-3.5"
      :style="{ background: `linear-gradient(110deg, ${currentStore.branding.primaryColor}, ${currentStore.branding.primaryColor}cc)`, color: textOn(currentStore.branding.primaryColor) }"
      data-testid="offers-store-header"
    >
      <StoreBadge :name="currentStore.name" :branding="currentStore.branding" :color="currentStore.brandColor" size="size-11" class="ring-2 ring-white/60" />
      <div class="min-w-0">
        <p class="truncate font-extrabold">{{ currentStore.name }}</p>
        <p class="truncate text-xs opacity-85">{{ currentStore.branding.slogan || `${choice?.branchName} branch` }}</p>
      </div>
      <span class="ml-auto shrink-0 rounded-full bg-white/20 px-2.5 py-1 text-xs font-bold">{{ storeOffers.length }} live</span>
    </div>
    <div class="space-y-5 px-5 py-5" data-testid="offers-panel">
      <div v-if="bill.totalDiscountCents" class="flex items-center gap-3 rounded-2xl bg-hela-green p-4 text-white">
        <span class="grid size-10 shrink-0 place-items-center rounded-full bg-hela-gold text-hela-green-900"><AppIcon name="gift" :size="19" /></span>
        <p class="text-sm">You’re saving <b class="text-hela-gold">{{ formatLKR(bill.totalDiscountCents) }}</b> on this cart.</p>
      </div>

      <section v-if="storeOffers.length" aria-labelledby="store-offers-h">
        <h3 id="store-offers-h" class="mb-3 text-sm font-bold text-ink">This branch’s offers ({{ storeOffers.length }})</h3>
        <ul class="space-y-3">
          <li v-for="o in storeOffers" :key="o.id" class="space-y-1.5" :data-testid="`offer-${o.code}`">
            <OfferCard :offer="o" :applied="appliedIds.has(o.id)" />
            <div v-if="!appliedIds.has(o.id) && bill.itemCount" class="px-1">
              <p v-if="hints.get(o.id)" class="text-xs font-semibold text-[#7A5600]">{{ hints.get(o.id) }}</p>
              <div v-if="progress(o) !== null && progress(o)! < 100" class="mt-1 h-1.5 overflow-hidden rounded-full bg-line" role="progressbar" :aria-valuenow="progress(o)!" aria-valuemin="0" aria-valuemax="100">
                <span class="block h-full rounded-full bg-hela-gold-600 transition-all" :style="{ width: `${progress(o)}%` }" />
              </div>
            </div>
            <button v-if="targetOf(o)" type="button" class="inline-flex items-center gap-1 px-1 text-xs font-bold text-hela-green hover:underline" :data-testid="`shop-offer-${o.code}`" @click="shop(o)">
              <AppIcon name="pin" :size="13" />Shop this offer in the store →
            </button>
          </li>
        </ul>
      </section>
      <p v-else-if="choice" class="rounded-2xl bg-white p-4 text-sm text-muted ring-1 ring-line">{{ choice.storeName }} has no offers at {{ choice.branchName }} right now.</p>

      <section v-if="comingSoon.length" aria-labelledby="soon-offers-h" data-testid="coming-soon">
        <h3 id="soon-offers-h" class="mb-3 flex items-center gap-2 text-sm font-bold text-ink"><AppIcon name="history" :size="15" class="text-hela-gold-600" />Coming soon</h3>
        <ul class="space-y-3">
          <li v-for="o in comingSoon" :key="o.id"><OfferCard :offer="o" compact /></li>
        </ul>
      </section>

      <section v-if="personalOnly.length" aria-labelledby="personal-offers-h">
        <h3 id="personal-offers-h" class="mb-3 text-sm font-bold text-ink">Just for you</h3>
        <ul class="space-y-3">
          <li v-for="o in personalOnly" :key="o.id"><OfferCard :offer="o" compact :applied="appliedIds.has(o.id)" /></li>
        </ul>
      </section>
      <p v-else-if="!isAuthenticated" class="text-center text-xs text-muted">Log in to see offers made just for you.</p>
      <p class="text-center text-xs text-muted">Offers apply automatically in your cart once the conditions are met.</p>
    </div>
  </SidePanel>
</template>
