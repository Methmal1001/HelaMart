<script setup lang="ts">
import { formatKm, rankStores, type RankedStore } from '~/lib/area'

/**
 * "Your supermarket" — a searchable, swipeable row of verified supermarkets
 * that deliver to the shopper's area (nearest first). One tap chooses a
 * supermarket (its nearest delivering branch); a branch can be switched when
 * several deliver. Others can be revealed by searching, greyed out with the
 * reason. Used on the welcome screen and the Browse page.
 */
const { choice, stores, refresh, select } = useStoreSelection()
const { area, openFinder } = useShoppingArea()
const { show } = useToasts()
const loaded = ref(false)
const query = ref('')
const row = ref<HTMLElement | null>(null)

onMounted(async () => {
  await refresh()
  loaded.value = true
})

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
const ranked = computed<RankedStore[]>(() => (area.value ? rankStores(stores.value, area.value) : []))
/** Search matches supermarket name, slogan, branch names and towns. */
function matches(r: RankedStore, q: string) {
  if (!q) return true
  const hay = norm([r.store.name, r.store.branding.slogan, ...r.store.branches.flatMap((b) => [b.name, b.city, b.district])].join(' '))
  return hay.includes(q)
}
const q = computed(() => norm(query.value))
const available = computed(() => ranked.value.filter((r) => r.available && matches(r, q.value)))
/** Shown only when searching: matching supermarkets that don't deliver here. */
const elsewhere = computed(() => (q.value ? ranked.value.filter((r) => !r.available && matches(r, q.value)).slice(0, 4) : []))
const current = computed(() => ranked.value.find((r) => r.store.id === choice.value?.storeId) ?? null)
const servingBranches = computed(() => current.value?.branches.filter((b) => b.delivers) ?? [])
const totalAvailable = computed(() => ranked.value.filter((r) => r.available).length)

function choose(r: RankedStore) {
  if (!r.serving) return
  if (choice.value?.storeId === r.store.id) return
  select(r.store.id, r.serving.id)
  show(`Shopping at ${r.store.name} · ${r.serving.name}`, 'success')
}
function chooseBranch(e: Event) {
  const id = (e.target as HTMLSelectElement).value
  if (current.value && id) select(current.value.store.id, id)
}
function scrollRow(dir: 1 | -1) {
  row.value?.scrollBy({ left: dir * 200, behavior: 'smooth' })
}
// Keep the chosen supermarket in view.
watch([() => choice.value?.storeId, loaded], async () => {
  await nextTick()
  row.value?.querySelector('[aria-checked="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
})
</script>

<template>
  <section aria-labelledby="chooser-title" data-testid="store-chooser">
    <div class="flex items-center justify-between gap-2">
      <h2 id="chooser-title" class="min-w-0 text-base leading-tight font-bold text-ink">
        Your supermarket
        <span v-if="area && loaded" class="block text-xs font-semibold text-muted">{{ totalAvailable }} deliver{{ totalAvailable === 1 ? 's' : '' }} to your area</span>
      </h2>
      <button v-if="area" type="button" class="flex max-w-[55%] shrink-0 items-center gap-1 rounded-full bg-hela-green-50 px-2.5 py-1 text-xs font-bold whitespace-nowrap text-hela-green transition hover:bg-hela-green hover:text-white" data-testid="change-area" @click="openFinder()">
        <AppIcon name="pin" :size="12" class="shrink-0" /><span class="truncate">{{ area.label }}</span><span class="shrink-0 opacity-70">· Change</span>
      </button>
    </div>

    <div v-if="!loaded" class="mt-2 h-28 animate-pulse rounded-2xl bg-hela-green-50" aria-hidden="true" />

    <!-- No area yet: the first step is finding supermarkets nearby -->
    <button v-else-if="!area" type="button" class="mt-2 flex w-full items-center gap-3 rounded-2xl bg-gradient-to-r from-hela-green to-[#0E3426] p-4 text-left text-white shadow-card transition hover:brightness-110" data-testid="find-near-me" @click="openFinder()">
      <span class="grid size-11 shrink-0 place-items-center rounded-xl bg-hela-gold text-hela-green-900"><AppIcon name="map" :size="20" /></span>
      <span class="min-w-0 flex-1">
        <span class="block font-bold">Find supermarkets near you</span>
        <span class="block text-xs text-white/75">Search your town or use your location — we’ll show who delivers to you.</span>
      </span>
      <AppIcon name="arrow-right" :size="18" />
    </button>

    <template v-else>
      <!-- Search -->
      <label class="relative mt-2 block">
        <span class="sr-only">Search supermarkets</span>
        <AppIcon name="search" :size="16" class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
        <input
          v-model="query"
          type="search"
          placeholder="Search supermarket, branch or town"
          :aria-description="`${totalAvailable} supermarkets deliver to ${area.label}`"
          class="h-10 w-full rounded-xl border-0 bg-white pr-3 pl-9 text-sm text-ink ring-1 ring-line placeholder:text-muted/80 focus:ring-2 focus:ring-hela-green focus:outline-none"
          data-testid="store-search"
        >
      </label>

      <!-- Supermarket cards -->
      <div class="relative mt-2">
        <div
          ref="row"
          class="-mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pt-1 pb-2 [scrollbar-width:thin]"
          role="radiogroup"
          aria-label="Supermarkets that deliver to you"
        >
          <button
            v-for="r in available"
            :key="r.store.id"
            type="button"
            role="radio"
            :aria-checked="choice?.storeId === r.store.id"
            class="relative flex w-44 shrink-0 snap-start flex-col rounded-2xl bg-white p-3 text-left ring-1 transition hover:-translate-y-0.5 hover:shadow-card"
            :class="choice?.storeId === r.store.id ? 'ring-2' : 'ring-line'"
            :style="choice?.storeId === r.store.id ? { '--tw-ring-color': r.store.branding.primaryColor, boxShadow: `0 8px 20px -12px ${r.store.branding.primaryColor}` } : undefined"
            :data-testid="`chooser-${r.store.id}`"
            @click="choose(r)"
          >
            <span v-if="choice?.storeId === r.store.id" class="absolute top-2 right-2 grid size-5 place-items-center rounded-full text-white" :style="{ background: r.store.branding.primaryColor }"><AppIcon name="check" :size="12" :stroke-width="3" /></span>
            <StoreBadge :name="r.store.name" :branding="r.store.branding" :color="r.store.brandColor" size="size-10" />
            <span class="mt-2 line-clamp-2 text-sm leading-tight font-bold text-ink">{{ r.store.name }}</span>
            <span class="mt-0.5 mb-2 block truncate text-[0.7rem] text-muted">{{ r.serving!.name }} branch</span>
            <span class="mt-auto inline-flex items-center gap-1 self-start rounded-full bg-hela-green-50 px-1.5 py-0.5 text-[0.6rem] font-bold text-hela-green"><AppIcon name="truck" :size="10" />Delivers · {{ formatKm(r.serving!.distanceKm) }}</span>
          </button>

          <div
            v-for="r in elsewhere"
            :key="r.store.id"
            class="flex w-44 shrink-0 snap-start flex-col rounded-2xl bg-cream/70 p-3 opacity-70 ring-1 ring-line"
            aria-disabled="true"
          >
            <StoreBadge :name="r.store.name" :branding="r.store.branding" :color="r.store.brandColor" size="size-10" class="grayscale" />
            <span class="mt-2 line-clamp-2 text-sm leading-tight font-bold text-ink">{{ r.store.name }}</span>
            <span class="mt-0.5 mb-2 block truncate text-[0.7rem] text-muted">Nearest {{ formatKm(r.nearest.distanceKm) }}</span>
            <span class="mt-auto inline-flex self-start rounded-full bg-[#FBEAEA] px-1.5 py-0.5 text-[0.6rem] font-bold text-[#8A2E2E]">Doesn’t deliver here</span>
          </div>

          <button type="button" class="grid w-28 shrink-0 snap-start place-items-center rounded-2xl border-2 border-dashed border-line p-3 text-center text-xs font-bold text-hela-green transition hover:border-hela-green hover:bg-hela-green-50" data-testid="chooser-map" @click="openFinder()">
            <span><AppIcon name="map" :size="20" class="mx-auto" /><span class="mt-1 block">See all on the map</span></span>
          </button>
        </div>
        <template v-if="available.length > 2">
          <button type="button" class="absolute top-1/2 -left-2 hidden size-7 -translate-y-1/2 place-items-center rounded-full bg-white text-ink shadow-card ring-1 ring-line sm:grid" aria-label="Scroll left" @click="scrollRow(-1)"><AppIcon name="arrow-left" :size="14" /></button>
          <button type="button" class="absolute top-1/2 -right-2 hidden size-7 -translate-y-1/2 place-items-center rounded-full bg-white text-ink shadow-card ring-1 ring-line sm:grid" aria-label="Scroll right" @click="scrollRow(1)"><AppIcon name="arrow-right" :size="14" /></button>
        </template>
      </div>

      <p v-if="!available.length && !elsewhere.length" class="rounded-xl bg-hela-gold-100/70 p-3 text-sm text-[#6d5622]">
        {{ query ? `No supermarket matches “${query}”.` : `No HelaMart supermarket delivers to ${area.label} yet — try a nearby town.` }}
      </p>
      <p v-else-if="!available.length && q" class="text-xs text-muted">None of these deliver to {{ area.label }}.</p>

      <!-- Branch (when more than one delivers here) -->
      <label v-if="current && servingBranches.length > 1" class="mt-1 flex items-center gap-2 text-xs">
        <span class="font-semibold text-muted">Branch</span>
        <select class="field h-8 flex-1 py-0 text-xs" :value="choice?.branchId" aria-label="Branch" data-testid="chooser-branch" @change="chooseBranch">
          <option v-for="b in servingBranches" :key="b.id" :value="b.id">{{ b.name }} · {{ formatKm(b.distanceKm) }}</option>
        </select>
      </label>
      <p v-else-if="current?.available && choice" class="mt-1 text-xs text-muted">
        Shopping at <b class="text-ink">{{ choice.storeName }} · {{ choice.branchName }}</b>
      </p>
    </template>
  </section>
</template>
