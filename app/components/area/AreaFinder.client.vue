<script setup lang="ts">
import type { ShopperLocation } from '~/types'
import type { AreaMap, MapPin } from '~/lib/three/areaMap'
import { PLACES, inSriLanka, nearestPlace, searchPlaces, type Place } from '~/data/places'
import { DEFAULT_RADIUS_KM, RADIUS_OPTIONS, formatKm, rankStores } from '~/lib/area'

/**
 * "Find supermarkets near you" — a 3D map of Sri Lanka with every verified
 * branch pinned. Shoppers pick an area (search, current location or a tap on
 * the map) and a radius; matching supermarkets light up and are listed.
 */
const { area, finder, setArea, closeFinder } = useShoppingArea()
const selection = useStoreSelection()
const { isAuthenticated } = useAuth()
const { show } = useToasts()

const mapEl = ref<HTMLElement | null>(null)
let map: AreaMap | null = null
const mapFailed = ref(false)
const draft = ref<ShopperLocation | null>(null)
const query = ref('')
const searchFocused = ref(false)
const locating = ref(false)
const geoError = ref('')
const hover = ref<{ pin: MapPin; x: number; y: number } | null>(null)
const focusedStore = ref<string | null>(null)

const POPULAR = ['Colombo', 'Gampaha', 'Negombo', 'Kandy', 'Galle', 'Kurunegala', 'Jaffna', 'Trincomalee', 'Anuradhapura', 'Batticaloa']
  .map((n) => PLACES.find((p) => p.name === n))
  .filter((p): p is Place => !!p)
const suggestions = computed(() => searchPlaces(query.value, 7))
const ranked = computed(() => (draft.value ? rankStores(selection.stores.value, draft.value) : []))
const inArea = computed(() => ranked.value.filter((r) => r.inArea))
const nearestOutside = computed(() => ranked.value.filter((r) => !r.inArea).slice(0, 3))
const pins = computed<MapPin[]>(() =>
  selection.stores.value.flatMap((s) =>
    s.branches.filter((b) => b.status === 'open').map((b) => ({ storeId: s.id, branchId: b.id, lat: b.lat, lng: b.lng, color: s.branding.primaryColor, label: `${s.name} · ${b.name}` })),
  ),
)

function choosePlace(p: Place, source: ShopperLocation['source'] = 'town') {
  draft.value = { label: p.name, district: p.district, lat: p.lat, lng: p.lng, radiusKm: draft.value?.radiusKm ?? DEFAULT_RADIUS_KM, source }
  query.value = ''
  searchFocused.value = false
  focusedStore.value = null
}

function onPick(lat: number, lng: number) {
  const town = nearestPlace(lat, lng)
  draft.value = { label: town.name, district: town.district, lat, lng, radiusKm: draft.value?.radiusKm ?? DEFAULT_RADIUS_KM, source: 'map' }
  focusedStore.value = null
}

function setRadius(km: number) {
  if (draft.value) draft.value = { ...draft.value, radiusKm: km }
}

function useMyLocation() {
  geoError.value = ''
  if (!('geolocation' in navigator)) {
    geoError.value = 'Location isn’t available in this browser — search for your town instead.'
    return
  }
  locating.value = true
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      locating.value = false
      const { latitude: lat, longitude: lng } = pos.coords
      if (!inSriLanka(lat, lng)) {
        geoError.value = 'You seem to be outside Sri Lanka — search for a town instead.'
        return
      }
      const town = nearestPlace(lat, lng)
      draft.value = { label: town.name, district: town.district, lat, lng, radiusKm: draft.value?.radiusKm ?? DEFAULT_RADIUS_KM, source: 'gps' }
    },
    () => {
      locating.value = false
      geoError.value = 'We couldn’t get your location. Allow location access, or search for your town.'
    },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
  )
}

async function apply() {
  if (!draft.value) return
  await setArea(draft.value)
  closeFinder()
}

async function shopHere(storeId: string, branchId: string) {
  if (draft.value) await setArea(draft.value)
  selection.select(storeId, branchId)
  closeFinder()
  const s = selection.stores.value.find((x) => x.id === storeId)
  show(`Shopping at ${s?.name ?? 'your supermarket'} — happy shopping!`, 'success')
}

function focusStore(storeId: string) {
  focusedStore.value = focusedStore.value === storeId ? null : storeId
  const r = ranked.value.find((x) => x.store.id === storeId)
  if (r && focusedStore.value) map?.focus(r.nearest.lat, r.nearest.lng, 10)
}

// ---- map lifecycle (only while open)
async function mountMap() {
  await nextTick()
  if (!mapEl.value || map) return
  try {
    const { AreaMap } = await import('~/lib/three/areaMap')
    if (!finder.value.open || !mapEl.value) return
    map = new AreaMap(mapEl.value, {
      onPick,
      onPinClick: (storeId) => focusStore(storeId),
      onPinHover: (pin, x, y) => (hover.value = pin ? { pin, x, y } : null),
    })
    // On wide screens the panel floats over the map's left side.
    map.setInsetLeft(window.innerWidth >= 1024 ? 448 : 0)
    map.setPins(pins.value)
    map.setArea(draft.value, false)
    if (!draft.value) map.overview()
    syncHighlight()
  } catch (e) {
    console.error('[HelaMart] area map failed', e)
    mapFailed.value = true
  }
}

function syncHighlight() {
  map?.setHighlighted(draft.value ? new Set(inArea.value.flatMap((r) => r.branches.filter((b) => b.distanceKm <= draft.value!.radiusKm).map((b) => b.id))) : null)
}

watch(
  () => finder.value.open,
  (open) => {
    if (open) {
      if (!selection.stores.value.length) selection.refresh()
      draft.value = area.value ? { ...area.value } : null
      geoError.value = ''
      focusedStore.value = null
      void mountMap()
    } else {
      map?.dispose()
      map = null
      hover.value = null
    }
  },
  { immediate: true },
)
watch(draft, (d, prev) => {
  if (!map) return
  const moved = !prev || !d || prev.lat !== d.lat || prev.lng !== d.lng || prev.radiusKm !== d.radiusKm
  if (moved) map.setArea(d)
  syncHighlight()
})
watch(pins, (p) => {
  map?.setPins(p)
  syncHighlight()
})
onBeforeUnmount(() => map?.dispose())

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && finder.value.open) closeFinder()
}
onMounted(() => document.addEventListener('keydown', onKey))
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))
</script>

<template>
  <Transition enter-active-class="transition duration-300" enter-from-class="opacity-0" leave-active-class="pointer-events-none transition duration-200" leave-to-class="opacity-0">
    <div v-if="finder.open" class="fixed inset-0 z-[60] flex flex-col bg-[#0b3a3f] lg:block" role="dialog" aria-modal="true" aria-labelledby="area-finder-title" data-testid="area-finder">
      <!-- Map -->
      <div class="relative h-[42vh] shrink-0 lg:absolute lg:inset-0 lg:h-auto">
        <div ref="mapEl" class="absolute inset-0" />
        <div v-if="mapFailed" class="absolute inset-0 grid place-items-center p-6 text-center text-sm text-white/80">The 3D map isn’t available on this device — use the search to choose your area.</div>
        <div v-if="hover" class="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[130%] rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap text-ink shadow-float" :style="{ left: `${hover.x}px`, top: `${hover.y}px` }">
          {{ hover.pin.label }}
        </div>
        <div class="pointer-events-none absolute inset-x-0 bottom-3 hidden justify-center lg:flex">
          <span class="rounded-full bg-black/35 px-3 py-1.5 text-xs text-white/90 backdrop-blur">Drag to turn · scroll to zoom · tap the island to choose an area · tap a pin to see a supermarket</span>
        </div>
        <button type="button" class="absolute top-3 right-3 grid size-11 place-items-center rounded-full bg-white/95 text-ink shadow-float hover:bg-white" aria-label="Close" @click="closeFinder"><AppIcon name="close" :size="20" /></button>
      </div>

      <!-- Panel -->
      <section class="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden bg-warm-white lg:absolute lg:top-4 lg:bottom-4 lg:left-4 lg:w-[26rem] lg:rounded-3xl lg:shadow-float">
        <header class="border-b border-line px-5 pt-5 pb-4">
          <div class="flex items-center gap-2">
            <BrandLogo size="sm" />
          </div>
          <h2 id="area-finder-title" class="mt-3 text-xl font-extrabold tracking-tight text-ink">Find supermarkets near you</h2>
          <p class="text-sm text-muted">{{ finder.reason ?? 'Choose your area to see HelaMart-verified supermarkets around you.' }}</p>

          <div class="relative mt-3">
            <AppIcon name="search" :size="17" class="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted" />
            <input
              v-model="query"
              type="search"
              class="h-11 w-full rounded-xl border-0 bg-white pr-3 pl-10 text-sm text-ink ring-1 ring-line placeholder:text-muted/80 focus:ring-2 focus:ring-hela-green focus:outline-none"
              placeholder="Search your town, e.g. Negombo"
              aria-label="Search your town"
              autocomplete="off"
              data-testid="area-search"
              @focus="searchFocused = true"
              @keydown.enter.prevent="suggestions[0] && choosePlace(suggestions[0])"
            >
            <ul v-if="query && searchFocused" class="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-xl bg-white shadow-float ring-1 ring-line" role="listbox">
              <li v-for="p in suggestions" :key="`${p.name}-${p.district}`">
                <button type="button" class="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left text-sm hover:bg-hela-green-50" role="option" @mousedown.prevent="choosePlace(p)">
                  <span class="font-semibold text-ink">{{ p.name }}</span><span class="text-xs text-muted">{{ p.district }} District</span>
                </button>
              </li>
              <li v-if="!suggestions.length" class="px-3.5 py-2.5 text-sm text-muted">No town found — try a nearby town or tap the map.</li>
            </ul>
          </div>
          <div class="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" class="chip bg-white text-hela-green ring-1 ring-line hover:bg-hela-green-50" :disabled="locating" @click="useMyLocation">
              <AppIcon name="pin" :size="13" />{{ locating ? 'Locating…' : 'Use my current location' }}
            </button>
          </div>
          <p v-if="geoError" class="mt-2 text-xs text-[#8A2E2E]" role="alert">{{ geoError }}</p>
        </header>

        <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <template v-if="!draft">
            <p class="text-xs font-bold tracking-wide text-muted uppercase">Popular areas</p>
            <div class="mt-2 flex flex-wrap gap-2">
              <button v-for="p in POPULAR" :key="p.name" type="button" class="chip bg-white text-ink ring-1 ring-line hover:bg-hela-green-50" @click="choosePlace(p)">{{ p.name }}</button>
            </div>
            <p class="mt-4 text-sm text-muted">{{ pins.length }} verified branches across Sri Lanka are on the map.</p>
          </template>

          <template v-else>
            <div class="flex items-center gap-3 rounded-2xl bg-hela-green p-3.5 text-white">
              <span class="grid size-10 shrink-0 place-items-center rounded-xl bg-hela-gold text-hela-green-900"><AppIcon name="pin" :size="19" /></span>
              <div class="min-w-0 flex-1">
                <p class="text-xs text-white/70">{{ draft.source === 'gps' ? 'Near your location' : draft.source === 'map' ? 'Near the point you chose' : 'Your area' }}</p>
                <p class="truncate font-bold" data-testid="area-label">{{ draft.label }}, {{ draft.district }}</p>
              </div>
            </div>

            <fieldset class="mt-3">
              <legend class="text-xs font-bold tracking-wide text-muted uppercase">Search within</legend>
              <div class="mt-1.5 grid grid-cols-4 gap-1.5 rounded-xl bg-white p-1 ring-1 ring-line">
                <button v-for="km in RADIUS_OPTIONS" :key="km" type="button" class="h-9 rounded-lg text-sm font-bold transition" :class="draft.radiusKm === km ? 'bg-hela-green text-white' : 'text-ink hover:bg-hela-green-50'" :aria-pressed="draft.radiusKm === km" @click="setRadius(km)">{{ km }} km</button>
              </div>
            </fieldset>

            <p class="mt-4 text-sm font-bold text-ink" data-testid="area-count">
              {{ inArea.length ? `${inArea.length} supermarket${inArea.length === 1 ? '' : 's'} within ${draft.radiusKm} km` : `No supermarkets within ${draft.radiusKm} km yet` }}
            </p>
            <ul class="mt-2 space-y-2">
              <li v-for="r in inArea" :key="r.store.id" class="rounded-2xl bg-white ring-1 transition" :class="focusedStore === r.store.id ? 'ring-2 ring-hela-green' : 'ring-line'" :data-testid="`area-store-${r.store.id}`">
                <button type="button" class="flex w-full items-center gap-3 p-3 text-left" :aria-expanded="focusedStore === r.store.id" @click="focusStore(r.store.id)">
                  <StoreBadge :name="r.store.name" :branding="r.store.branding" :color="r.store.brandColor" />
                  <span class="min-w-0 flex-1">
                    <span class="block truncate font-bold text-ink">{{ r.store.name }}</span>
                    <span class="block truncate text-xs text-muted">{{ r.nearest.name }} · {{ formatKm(r.nearest.distanceKm) }}</span>
                  </span>
                  <span v-if="r.nearest.delivers" class="chip shrink-0 bg-hela-green-50 text-[0.65rem] text-hela-green"><AppIcon name="truck" :size="11" />Delivers</span>
                </button>
                <div v-if="focusedStore === r.store.id" class="space-y-1.5 border-t border-line px-3 pt-2 pb-3">
                  <p v-if="r.store.branding.slogan" class="text-xs text-muted italic">“{{ r.store.branding.slogan }}”</p>
                  <div v-for="b in r.branches.filter((x) => x.status === 'open' && x.distanceKm <= draft!.radiusKm * 1.5)" :key="b.id" class="flex items-center justify-between gap-2 rounded-xl bg-cream px-3 py-2 text-sm">
                    <span class="min-w-0">
                      <span class="block truncate font-semibold text-ink">{{ b.name }}</span>
                      <span class="block text-xs text-muted">{{ formatKm(b.distanceKm) }} · {{ b.delivers ? 'Home delivery to your area' : 'Pickup (outside delivery area)' }}</span>
                    </span>
                    <button type="button" class="btn-primary h-9 shrink-0 px-3 text-xs" :data-testid="`shop-${b.id}`" @click="shopHere(r.store.id, b.id)">Shop here</button>
                  </div>
                </div>
              </li>
            </ul>

            <div v-if="nearestOutside.length" class="mt-4">
              <p class="text-xs font-bold tracking-wide text-muted uppercase">{{ inArea.length ? 'Further away' : 'Nearest supermarkets' }}</p>
              <ul class="mt-2 space-y-1.5">
                <li v-for="r in nearestOutside" :key="r.store.id" class="flex items-center gap-3 rounded-xl bg-white/70 p-2.5 text-sm ring-1 ring-line">
                  <StoreBadge :name="r.store.name" :branding="r.store.branding" :color="r.store.brandColor" size="size-8" />
                  <span class="min-w-0 flex-1"><span class="block truncate font-semibold text-ink">{{ r.store.name }}</span><span class="block text-xs text-muted">{{ r.nearest.name }} · {{ formatKm(r.nearest.distanceKm) }}</span></span>
                  <button type="button" class="text-xs font-bold text-hela-green hover:underline" @click="shopHere(r.store.id, r.nearest.id)">Shop here</button>
                </li>
              </ul>
            </div>
          </template>
        </div>

        <footer class="border-t border-line bg-white px-5 py-3.5">
          <button type="button" class="btn-primary h-11 w-full" :disabled="!draft" data-testid="area-apply" @click="apply">
            <AppIcon name="check" :size="17" />{{ isAuthenticated ? 'Save as my shopping area' : 'Show supermarkets in this area' }}
          </button>
          <p class="mt-1.5 text-center text-xs text-muted">{{ isAuthenticated ? 'Saved to your account — change it anytime.' : 'Log in to keep your area on every device.' }}</p>
        </footer>
      </section>
    </div>
  </Transition>
</template>
