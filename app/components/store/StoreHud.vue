<script setup lang="ts">
import { getProduct } from '~/data/products'

const xp = useStoreExperience()
const ui = useStoreUi()
const { itemCount, lastAdded } = useCart()
const bill = useBill()
const { startCheckout } = useCheckout()
const { choice: storeChoice, currentStore, refresh: refreshStores } = useStoreSelection()
const { area, openFinder } = useShoppingArea()
const { storeOffers } = useOffers()
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
</script>

<template>
  <div class="pointer-events-none absolute inset-0 z-20 select-none">
    <!-- Top bar -->
    <div class="flex items-start justify-between gap-3 p-3 sm:p-4">
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
        class="hud-surface pointer-events-auto absolute top-[4.6rem] left-1/2 flex max-w-[calc(100vw-1.5rem)] -translate-x-1/2 items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold text-ink sm:top-4 sm:text-sm"
        role="status"
        aria-live="polite"
      >
        <span class="size-2.5 shrink-0 rounded-full" :style="{ background: section?.color ?? '#174D38' }" aria-hidden="true" />
        <span class="truncate">
          <template v-if="section">
            <span class="text-muted">You’re in</span>
            {{ section.aisle ? `${section.aisle} · ` : '' }}{{ section.name }}
          </template>
          <template v-else>Main walkway</template>
        </span>
      </div>

      <!-- Nudge toward the checkout counters once something is in the cart. -->
      <div
        v-if="itemCount && section?.id !== 'checkout'"
        class="pointer-events-auto absolute top-[7.4rem] left-1/2 hidden -translate-x-1/2 items-center gap-2 rounded-full bg-hela-green/92 py-1.5 pr-1.5 pl-4 text-xs font-semibold whitespace-nowrap text-white shadow-card sm:top-[4.1rem] sm:flex"
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
      <div v-if="xp.welcomeBanner.value" class="absolute inset-x-0 top-28 flex justify-center px-4 sm:top-24" role="status">
        <div class="rounded-2xl bg-hela-green px-6 py-4 text-center text-white shadow-float">
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
    <div class="pointer-events-auto absolute right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] hidden sm:block">
      <StoreMinimap />
    </div>
    <div class="pointer-events-auto absolute right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] sm:hidden">
      <button type="button" class="btn-icon hud-surface size-12" aria-label="Open store map and aisles" @click="ui.openPanel('browse')">
        <AppIcon name="map" :size="20" />
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
      <div class="border-b border-line px-5 py-4 sm:hidden">
        <StoreMinimap class="!w-full" />
      </div>
      <CatalogBrowser compact can-locate @locate="locate" />
    </SidePanel>
  </div>
</template>
