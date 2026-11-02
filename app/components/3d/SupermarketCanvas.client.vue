<script setup lang="ts">
import type { StoreEngine } from '~/lib/three/StoreEngine'
import { isQualityLevel } from '~/composables/useStoreExperience'
import { catalogVersion, products } from '~/data/products'
import type { ShelfPromos } from '~/lib/three/products/atlas'
import type { PromoBoards } from '~/lib/three/offerSigns'

/**
 * Client-only host for the Three.js store. The engine (and Three.js itself)
 * is loaded as a separate chunk, so the welcome UI paints before WebGL work.
 */
const container = ref<HTMLElement | null>(null)
const xp = useStoreExperience()
const { avatar, select } = useAvatar()
const ui = useStoreUi()
const { refresh: refreshStores, currentStore } = useStoreSelection()
const brandingFor = (s: typeof currentStore.value) => (s ? { name: s.name, profile: s.branding } : null)
let engine: StoreEngine | null = null
let cancelled = false

onMounted(async () => {
  if (!hasWebGL()) {
    xp.phase.value = 'unsupported'
    return
  }
  xp.phase.value = 'loading'
  xp.progress.value = { value: 0.02, label: 'Preparing the store' }
  const storedQuality = readStorage(STORAGE_KEYS.quality, isQualityLevel)
  xp.quality.value = storedQuality ?? suggestQuality()

  try {
    const { StoreEngine } = await import('~/lib/three/StoreEngine')
    if (cancelled || !container.value) return
    const startInside = xp.hasEntered.value
    engine = new StoreEngine(
      container.value,
      {
        onProgress: (value, label) => (xp.progress.value = { value, label }),
        onPhase: (phase) => {
          xp.phase.value = phase
          if (phase === 'inside') xp.hasEntered.value = true
        },
        onPlayer: (p) => (xp.player.value = p),
        onProductPick: (id) => ui.openProduct(id),
        onProductHover: (h) => (xp.hover.value = h),
        onAvatarPick: (kind) => select(kind),
        onPointerLock: (locked) => (xp.pointerLocked.value = locked),
        onAvatarPortraits: (p) => (xp.portraits.value = p),
        onWelcomeInside: () => (xp.welcomeBanner.value = true),
      },
      {
        quality: xp.quality.value,
        reducedMotion: prefersReducedMotion(),
        startInside,
        avatar: avatar.value,
        spawn: startInside && xp.player.value ? xp.player.value : null,
      },
    )
    xp.attach(engine)
    xp.viewMode.value = 'third'
    // Stock the shelves with the chosen supermarket's latest catalogue (prices, photos, stock).
    await refreshStores()
    if (cancelled) return
    engine.setBranding(brandingFor(currentStore.value))
    const promo = promotions()
    engine.setPromotions(promo.shelf, promo.boards)
    await engine.init()
    syncCart()
  } catch (err) {
    console.error('[HelaMart] 3D store failed to start', err)
    xp.phase.value = 'error'
  }
})

onBeforeUnmount(() => {
  cancelled = true
  engine?.dispose()
  engine = null
  xp.detach()
  xp.hover.value = null
  xp.pointerLocked.value = false
  xp.phase.value = 'loading'
})

watch(avatar, (kind) => kind && engine?.selectAvatar(kind))
// The supermarket's approved theme: racks, checkout, banners and signs.
watch(() => JSON.stringify(brandingFor(currentStore.value)), () => engine?.setBranding(brandingFor(currentStore.value)))

// The branch's promotions in the store: red shelf tags, end-cap boards and the "Offers this week" board.
const { storeOffers, allOffers, promoFor } = useOffers()
function promotions(): { shelf: ShelfPromos; boards: PromoBoards | null } {
  void catalogVersion.value
  const shelf: ShelfPromos = new Map()
  for (const p of products) {
    const promo = promoFor(p)
    if (promo) shelf.set(p.id, { badge: promo.badge, nowCents: promo.conditional ? undefined : promo.nowCents })
  }
  const running = storeOffers.value.filter((o) => !o.upcoming && !offerTimingProblem(o))
  const boards = running.length && currentStore.value
    ? {
        storeName: currentStore.value.name,
        offers: running.map((o) => ({ headline: offerHeadline(o.rule), subject: offerSubject(o.rule), categoryId: ruleTarget(o.rule)?.categoryIds[0] })),
      }
    : null
  return { shelf, boards }
}
watch(
  () => JSON.stringify([allOffers.value.map((o) => o.id), currentStore.value?.id, catalogVersion.value]),
  () => {
    const { shelf, boards } = promotions()
    engine?.setPromotions(shelf, boards)
  },
)
// A different supermarket/branch (or updated photos and stock) restocks the shelves.
watch(catalogVersion, () => {
  if (xp.phase.value !== 'loading') void engine?.rebuildProducts()
})
watch(ui.overlayOpen, (open) => engine?.setInputEnabled(!open))

// Collected items ride in the 3D cart, with the running total shown above it.
const { lines, itemCount } = useCart()
const bill = useBill()
function syncCart() {
  const b = bill.value
  engine?.setCartContents(lines.value, {
    count: b.itemCount,
    total: formatLKR(b.itemsTotalCents),
    savings: b.itemDiscountCents + b.orderDiscountCents ? formatLKR(b.itemDiscountCents + b.orderDiscountCents) : undefined,
  })
}
watch(bill, syncCart, { deep: true })

// Pushing the cart into the checkout area opens the billing process automatically.
const { startCheckout } = useCheckout()
const { show } = useToasts()
let checkoutArmed = true
watch(
  () => xp.player.value?.sectionId,
  (id) => {
    if (id !== 'checkout') {
      checkoutArmed = true
      return
    }
    if (!checkoutArmed || xp.phase.value !== 'inside' || !itemCount.value || ui.overlayOpen.value) return
    checkoutArmed = false
    show('You’ve reached the checkout counters — let’s bill your items.')
    void startCheckout('Log in to pay for the items in your cart.')
  },
)

// Locate a product requested from elsewhere (e.g. the catalogue page).
watch(
  () => [xp.phase.value, xp.pendingProductId.value] as const,
  ([phase, pending]) => {
    if (phase !== 'inside' || !pending) return
    const label = xp.pendingLabel.value
    xp.pendingProductId.value = null
    xp.pendingLabel.value = null
    setTimeout(async () => {
      await xp.goToProduct(pending)
      if (label) show(`Here you are: ${label}`, 'success', 4500)
    }, 350)
  },
  { immediate: true },
)
</script>

<template>
  <div ref="container" class="absolute inset-0 overflow-hidden outline-none" />
</template>
