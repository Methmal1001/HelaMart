<script setup lang="ts">
import { catalogVersion, getProduct } from '~/data/products'
import { sectionColor, sectionTitle } from '~/data/storeLayout'

const xp = useStoreExperience()
const ui = useStoreUi()
const { itemCount, lastAdded } = useCart()
const bill = useBill()
const { startCheckout } = useCheckout()
const { choice: storeChoice, currentStore, refresh: refreshStores } = useStoreSelection()
const { area, openFinder } = useShoppingArea()
/** The supermarket's own name/colour for the section the shopper is in. */
const sectionLook = computed(() => {
  void catalogVersion.value
  const s = xp.currentSection.value
  return s ? { title: sectionTitle(s), color: sectionColor(s) } : null
})
const { storeOffers: allStoreOffers } = useOffers()
const storeOffers = computed(() => allStoreOffers.value.filter((o) => !o.upcoming))
onMounted(() => !storeChoice.value && refreshStores())

const isTouch = ref(false)
const showHint = ref(true)
const cartBump = ref(false)

onMounted(() => {
  isTouch.value = isCoarsePointer()
  setTimeout(() => (showHint.value = false), 12000)
})

const hovered = computed(() => {
  const h = xp.hover.value
  if (!h || isTouch.value || ui.overlayOpen.value) return null
  const p = getProduct(h.productId)
  return p ? { p, x: h.x, y: h.y } : null
})

const section = computed(() => xp.currentSection.value)

// Welcome message after walking in.
watch(
  () => xp.welcomeBanner.value,
  (v) => v && setTimeout(() => (xp.welcomeBanner.value = false), 4200),
  { immediate: true },
)

watch(lastAdded, () => {
  cartBump.value = true
  setTimeout(() => (cartBump.value = false), 450)
})

async function locate(id: string) {
  ui.closePanel()
  await xp.goToProduct(id)
}

// ---- phones and tablets: the same buttons as the desktop bar, arranged to fit
const mapOpen = ref(false)
function toggleMap() {
  mapOpen.value = !mapOpen.value
  if (mapOpen.value) ui.minimapOpen.value = true
}
/** Choosing a section walks there, so get the map out of the way. */
function onMapTap(e: Event) {
  if ((e.target as Element).closest('svg')) mapOpen.value = false
}
watch(ui.overlayOpen, (open) => open && (mapOpen.value = false))
</script>

<template>
  <div class="pointer-events-none absolute inset-0 z-20 select-none">
    <!-- Phones and tablets: store and area, account and cart on top; everything else in a rail down the side. -->
    <div class="lg:hidden" data-testid="hud-mobile">
      <div class="flex items-center gap-2 px-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-3">
        <button
          type="button"
          class="hud-surface pointer-events-auto flex h-12 min-w-0 flex-1 items-center gap-2 rounded-2xl pr-3 pl-1.5 text-left"
          :aria-label="area ? `Shopping at ${storeChoice?.storeName ?? 'HelaMart'}. Your area: ${area.label}. Change area` : 'Find supermarkets near you'"
          data-testid="hud-area"
          @click="openFinder()"
        >
          <BrandLogo size="sm" mark />
          <span class="min-w-0 leading-tight">
            <span class="block truncate text-xs font-extrabold text-ink">{{ storeChoice ? `${storeChoice.storeName} · ${storeChoice.branchName}` : 'HelaMart' }}</span>
            <span class="flex items-center gap-1 text-[0.7rem] font-semibold text-hela-green">
              <AppIcon name="pin" :size="11" class="shrink-0" />
              <span class="truncate">{{ area?.label ?? 'Set your area' }}</span>
              <span class="shrink-0 underline underline-offset-2">Change</span>
            </span>
          </span>
        </button>
        <span class="pointer-events-auto shrink-0"><AccountButton compact /></span>
        <button
          type="button"
          class="btn-primary pointer-events-auto relative h-11 shrink-0 px-3.5 transition-transform"
          :class="cartBump ? 'scale-110' : ''"
          :aria-label="`Open cart, ${itemCount} items`"
          data-testid="hud-cart"
          @click="ui.openPanel('cart')"
        >
          <AppIcon name="cart" :size="19" />
          <span
            v-if="itemCount"
            class="absolute -top-1.5 -right-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-hela-gold px-1 text-[0.68rem] font-extrabold text-hela-green-900 ring-2 ring-white"
          >{{ itemCount > 99 ? '99+' : itemCount }}</span>
        </button>
      </div>

      <div class="mt-2 flex items-start justify-between gap-2 px-2 sm:px-3">
        <div class="flex min-w-0 flex-col items-start gap-1.5">
          <div class="hud-surface pointer-events-auto flex max-w-full items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold text-ink" role="status" aria-live="polite" data-testid="hud-section">
            <span class="size-2.5 shrink-0 rounded-full" :style="{ background: sectionLook?.color ?? '#174D38' }" aria-hidden="true" />
            <span class="truncate">
              <template v-if="section">{{ section.aisle ? `${section.aisle} · ` : '' }}{{ sectionLook?.title }}</template>
              <template v-else>Main walkway</template>
            </span>
          </div>
          <button
            v-if="itemCount && section?.id !== 'checkout'"
            type="button"
            class="pointer-events-auto flex max-w-full items-center gap-1.5 rounded-full bg-hela-green py-1.5 pr-1.5 pl-3 text-xs font-bold text-white shadow-card"
            data-testid="hud-checkout"
            @click="startCheckout()"
          >
            <span class="truncate tabular-nums">{{ formatLKR(bill.itemsTotalCents) }}</span>
            <span class="shrink-0 rounded-full bg-hela-gold px-2.5 py-1 text-hela-green-900">Checkout</span>
          </button>
        </div>

        <div class="flex shrink-0 flex-col gap-1.5 [@media(max-height:500px)]:flex-row" data-testid="hud-rail">
          <button type="button" class="hud-rail relative" :aria-label="`Offers${storeOffers.length ? ` (${storeOffers.length})` : ''}`" data-testid="hud-rail-offers" @click="ui.openPanel('offers')">
            <AppIcon name="gift" :size="18" class="text-[#C2361A]" />Offers
            <span v-if="storeOffers.length" class="absolute -top-1 -right-1 grid min-w-4.5 place-items-center rounded-full bg-[#E23B3B] px-1 text-[0.6rem] font-bold text-white">{{ storeOffers.length }}</span>
          </button>
          <button type="button" class="hud-rail" aria-label="Browse aisles list" data-testid="hud-rail-browse" @click="ui.openPanel('browse')">
            <AppIcon name="list" :size="18" />Browse
          </button>
          <button type="button" class="hud-rail" :aria-label="xp.viewMode.value === 'third' ? 'Switch to first-person view' : 'Switch to view behind avatar'" data-testid="hud-rail-view" @click="xp.toggleView()">
            <AppIcon name="eye" :size="18" />View
          </button>
          <button type="button" class="hud-rail" aria-label="Settings" data-testid="hud-rail-settings" @click="ui.openPanel('settings')">
            <AppIcon name="settings" :size="18" />Settings
          </button>
          <button type="button" class="hud-rail" aria-label="How to move around" data-testid="hud-rail-help" @click="ui.openPanel('help')">
            <AppIcon name="info" :size="18" />Help
          </button>
        </div>
      </div>
    </div>

    <!-- Top bar -->
    <div class="hidden items-start justify-between gap-3 p-3 sm:p-4 lg:flex">
      <div class="hud-surface pointer-events-auto flex items-center gap-3 rounded-2xl py-2 pr-4 pl-2">
        <BrandLogo size="sm" />
        <span class="hidden h-7 w-px bg-line md:block" aria-hidden="true" />
        <StoreBadge v-if="storeChoice" :name="storeChoice.storeName" :branding="currentStore?.branding" :color="storeChoice.brandColor" size="size-8" class="hidden md:grid" />
        <span v-if="storeChoice" class="hidden min-w-0 leading-tight md:block">
          <span class="block text-[0.65rem] font-semibold tracking-wide text-muted uppercase">Shopping at</span>
          <span class="block max-w-52 truncate text-xs font-bold text-ink">{{ storeChoice.storeName }} · {{ storeChoice.branchName }}</span>
        </span>
        <span v-else class="hidden text-xs font-semibold text-hela-gold-600 md:block">Everything for Every Home.</span>
        <button
          type="button"
          class="ml-1 flex items-center gap-1 rounded-full bg-hela-green-50 px-2.5 py-1 text-xs font-bold text-hela-green transition hover:bg-hela-green hover:text-white"
          :aria-label="area ? `Your area: ${area.label}. Change area` : 'Find supermarkets near you'"
          data-testid="hud-area"
          @click="openFinder()"
        >
          <AppIcon name="pin" :size="13" /><span class="max-w-24 truncate">{{ area?.label ?? 'Set area' }}</span>
        </button>
      </div>

      <div
        class="hud-surface pointer-events-auto absolute top-[4.6rem] left-1/2 flex max-w-[calc(100vw-1.5rem)] -translate-x-1/2 items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold text-ink sm:text-sm xl:top-4"
        role="status"
        aria-live="polite"
      >
        <span class="size-2.5 shrink-0 rounded-full" :style="{ background: sectionLook?.color ?? '#174D38' }" aria-hidden="true" />
        <span class="truncate">
          <template v-if="section">
            <span class="text-muted">You’re in</span>
            {{ section.aisle ? `${section.aisle} · ` : '' }}{{ sectionLook?.title }}
          </template>
          <template v-else>Main walkway</template>
        </span>
      </div>

      <!-- Nudge toward the checkout counters once something is in the cart. -->
      <div
        v-if="itemCount && section?.id !== 'checkout'"
        class="pointer-events-auto absolute top-[7.4rem] left-1/2 hidden -translate-x-1/2 items-center gap-2 rounded-full bg-hela-green/92 py-1.5 pr-1.5 pl-4 text-xs font-semibold whitespace-nowrap text-white shadow-card lg:flex xl:top-[4.1rem]"
      >
        <AppIcon name="receipt" :size="14" class="text-hela-gold" />
        Push your cart to the checkout counters to pay
        <button type="button" class="rounded-full bg-hela-gold px-3 py-1 font-bold text-hela-green-900 hover:bg-[#d9bd6f]" @click="startCheckout()">
          Checkout now
        </button>
      </div>

      <div class="pointer-events-auto flex items-center gap-2">
        <AccountButton compact />
        <button type="button" class="btn-icon hud-surface relative sm:w-auto sm:gap-2 sm:px-3.5" :aria-label="`Offers${storeOffers.length ? ` (${storeOffers.length})` : ''}`" data-testid="hud-offers" @click="ui.openPanel('offers')">
          <AppIcon name="gift" :size="19" class="text-[#C2361A]" />
          <span class="hidden text-sm font-semibold sm:inline">Offers</span>
          <span v-if="storeOffers.length" class="absolute -top-1.5 -right-1.5 grid min-w-5 place-items-center rounded-full bg-[#E23B3B] px-1 text-[0.65rem] font-bold text-white">{{ storeOffers.length }}</span>
        </button>
        <button type="button" class="btn-icon hud-surface sm:w-auto sm:gap-2 sm:px-3.5" aria-label="Browse aisles list" @click="ui.openPanel('browse')">
          <AppIcon name="list" :size="19" />
          <span class="hidden text-sm font-semibold sm:inline">Browse</span>
        </button>
        <button type="button" class="btn-icon hud-surface" aria-label="Settings and controls" @click="ui.openPanel('settings')">
          <AppIcon name="settings" :size="19" />
        </button>
        <button
          type="button"
          class="btn-primary relative h-11 px-3.5 transition-transform"
          :class="cartBump ? 'scale-110' : ''"
          :aria-label="`Open cart, ${itemCount} items`"
          @click="ui.openPanel('cart')"
        >
          <AppIcon name="cart" :size="19" />
          <span class="hidden tabular-nums sm:inline">{{ formatLKR(bill.itemsTotalCents) }}</span>
          <span
            v-if="itemCount"
            class="absolute -top-1.5 -right-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-hela-gold px-1 text-[0.68rem] font-extrabold text-hela-green-900 ring-2 ring-white"
          >{{ itemCount > 99 ? '99+' : itemCount }}</span>
        </button>
      </div>
    </div>

    <!-- Welcome message -->
    <Transition
      enter-active-class="transition duration-500 ease-[cubic-bezier(.2,.8,.2,1)]"
      leave-active-class="transition duration-500"
      enter-from-class="opacity-0 -translate-y-3"
      leave-to-class="opacity-0"
    >
      <div v-if="xp.welcomeBanner.value" class="absolute inset-x-0 top-[7.5rem] flex justify-center pr-[4.5rem] pl-2 lg:top-24 lg:px-4" role="status">
        <div class="rounded-2xl bg-hela-green px-4 py-3 text-center text-white shadow-float lg:px-6 lg:py-4">
          <p class="text-xs font-bold tracking-[0.2em] text-hela-gold uppercase">Ayubowan!</p>
          <p class="mt-1 text-lg font-extrabold tracking-tight">Welcome to HelaMart</p>
          <p v-if="currentStore" class="mx-auto mt-1.5 max-w-sm text-sm text-white/90">
            You’re shopping at <b class="text-hela-gold">{{ currentStore.name }}</b>{{ currentStore.branding.welcomeMessage ? ` — ${currentStore.branding.welcomeMessage}` : currentStore.branding.slogan ? ` — ${currentStore.branding.slogan}` : '' }}
          </p>
          <p class="mt-0.5 text-xs text-white/75">{{ isTouch ? 'Use the joystick to walk and tap a product to shop.' : 'Use WASD to walk, drag to look, and click any product.' }}</p>
        </div>
      </div>
    </Transition>

    <!-- Crosshair in mouse-look mode -->
    <div v-if="xp.pointerLocked.value" class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" aria-hidden="true">
      <span class="block size-2.5 rounded-full bg-white ring-2 ring-hela-green" />
    </div>
    <div v-if="xp.pointerLocked.value" class="absolute inset-x-0 bottom-24 flex justify-center">
      <span class="hud-surface rounded-full px-4 py-2 text-xs font-semibold text-ink">
        Mouse-look on · press <kbd class="font-bold">Esc</kbd> to release the mouse
      </span>
    </div>

    <!-- Hover product tag -->
    <div
      v-if="hovered"
      class="absolute rounded-xl bg-white px-3 py-2 text-xs shadow-float ring-1 ring-black/5"
      :style="{
        left: `${xp.pointerLocked.value ? '50%' : hovered.x + 16 + 'px'}`,
        top: `${xp.pointerLocked.value ? 'calc(50% + 18px)' : hovered.y + 14 + 'px'}`,
      }"
    >
      <p class="font-bold text-ink">{{ hovered.p.name }}</p>
      <p class="text-muted">{{ hovered.p.size }} · <span class="font-bold text-hela-green">{{ formatLKR(hovered.p.priceCents) }}</span></p>
    </div>

    <!-- Bottom-left: joystick (touch) or controls hint (desktop) -->
    <div class="absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 flex flex-col items-start gap-2">
      <VirtualJoystick v-if="isTouch" class="pointer-events-auto" @move="xp.setMoveInput" />
      <template v-else>
        <Transition leave-active-class="transition duration-500" leave-to-class="opacity-0">
          <div v-if="showHint" class="hud-surface pointer-events-auto rounded-2xl px-4 py-3 text-xs text-muted">
            <p class="mb-1.5 font-bold text-ink">Getting around</p>
            <p><b class="text-ink">WASD</b> walk · <b class="text-ink">Shift</b> faster · <b class="text-ink">drag</b> to look</p>
            <p><b class="text-ink">Click</b> a product · <b class="text-ink">V</b> change view · <b class="text-ink">L</b> mouse-look</p>
          </div>
        </Transition>
        <div class="pointer-events-auto flex gap-2">
          <button type="button" class="btn-ghost hud-surface h-10 px-3 text-xs" @click="xp.requestPointerLock()">
            <AppIcon name="mouse" :size="16" />
            Mouse-look
          </button>
          <button type="button" class="btn-ghost hud-surface h-10 px-3 text-xs" @click="ui.openPanel('help')">
            <AppIcon name="keyboard" :size="16" />
            Controls
          </button>
        </div>
      </template>
    </div>

    <!-- Bottom-right: minimap -->
    <div class="pointer-events-auto absolute right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] hidden lg:block">
      <StoreMinimap />
    </div>
    <div v-if="mapOpen" class="pointer-events-auto absolute right-4 bottom-[calc(max(1rem,env(safe-area-inset-bottom))+3.75rem)] max-h-[60dvh] overflow-y-auto rounded-2xl lg:hidden" data-testid="hud-map-card" @click="onMapTap">
      <StoreMinimap class="!w-56" />
    </div>
    <div class="pointer-events-auto absolute right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] lg:hidden">
      <button type="button" class="hud-rail size-[3.25rem]" :aria-label="mapOpen ? 'Close store map' : 'Open store map'" :aria-expanded="mapOpen" data-testid="hud-map" @click="toggleMap">
        <AppIcon :name="mapOpen ? 'close' : 'map'" :size="18" />Map
      </button>
    </div>

    <!-- Travel fade -->
    <div
      class="absolute inset-0 bg-cream transition-opacity duration-200"
      :class="xp.fading.value ? 'opacity-100' : 'opacity-0'"
      aria-hidden="true"
    />

    <!-- Aisle list / accessible browsing -->
    <SidePanel :open="ui.panel.value === 'browse'" title="Browse aisles" side="left" width="sm:max-w-md" @close="ui.closePanel()">
      <template #subtitle>
        <p class="text-xs text-muted">Shop every section without walking — or jump to it in 3D.</p>
      </template>
      <div class="border-b border-line px-5 py-4 lg:hidden">
        <StoreMinimap class="!w-full" />
      </div>
      <CatalogBrowser compact can-locate @locate="locate" />
    </SidePanel>
  </div>
</template>
