<script setup lang="ts">
import { formatKm, rankStores, type RankedBranch } from '~/lib/area'
import type { PublicStore } from '~/services/partnerService'

/** "Where are you shopping?" — verified supermarkets near the shopper's area, nearest first. */
withDefaults(defineProps<{ compact?: boolean }>(), { compact: false })
const { choice, stores, currentStore, refresh, select } = useStoreSelection()
const { area, openFinder } = useShoppingArea()
const open = ref(false)
const storeId = ref('')
const branchId = ref('')
const loaded = ref(false)
const showFar = ref(false)

onMounted(() => {
  refresh()
  loaded.value = true
})

const ranked = computed(() => (area.value ? rankStores(stores.value, area.value) : null))
const nearby = computed(() => ranked.value?.filter((r) => r.inArea) ?? null)
const far = computed(() => ranked.value?.filter((r) => !r.inArea) ?? [])
/** Stores to list: those in the area (plus "further away" on request), or everything when no area is set. */
const listed = computed(() =>
  ranked.value ? [...(nearby.value ?? []), ...(showFar.value || !nearby.value?.length ? far.value : [])].map((r) => r.store) : stores.value,
)
const distanceOf = (s: PublicStore) => ranked.value?.find((r) => r.store.id === s.id)?.nearest
const store = computed(() => stores.value.find((s) => s.id === storeId.value))
const branches = computed<(PublicStore['branches'][number] & Partial<RankedBranch>)[]>(() => {
  if (!store.value) return []
  return ranked.value?.find((r) => r.store.id === store.value!.id)?.branches ?? store.value.branches
})
const currentBranch = computed(() => (area.value && currentStore.value ? rankStores([currentStore.value], area.value)[0]?.branches.find((b) => b.id === choice.value?.branchId) : undefined))

function start() {
  storeId.value = choice.value?.storeId ?? listed.value[0]?.id ?? ''
  branchId.value = choice.value?.branchId ?? ''
  showFar.value = !!ranked.value && !ranked.value.find((r) => r.store.id === storeId.value)?.inArea
  open.value = true
}
watch(storeId, () => {
  if (!branches.value.some((b) => b.id === branchId.value)) branchId.value = branches.value.find((b) => b.status === 'open')?.id ?? ''
})
function confirm() {
  select(storeId.value, branchId.value)
  open.value = false
}
function changeArea() {
  open.value = false
  openFinder()
}
</script>

<template>
  <div>
    <div v-if="!loaded" class="h-12 animate-pulse rounded-xl bg-hela-green-50" aria-hidden="true" />
    <template v-else>
      <button
        v-if="choice"
        type="button"
        class="flex w-full items-center gap-3 rounded-xl bg-white text-left ring-1 ring-line transition hover:ring-hela-green"
        :class="compact ? 'px-3 py-2' : 'px-3.5 py-2.5'"
        :aria-label="`Shopping at ${choice.storeName}, ${choice.branchName}. Change store`"
        @click="start"
      >
        <StoreBadge :name="choice.storeName" :branding="currentStore?.branding" :color="choice.brandColor" />
        <span class="min-w-0 flex-1">
          <span class="block text-[0.7rem] font-semibold tracking-wide text-muted uppercase">Shopping at</span>
          <span class="block truncate text-sm font-bold text-ink">{{ choice.storeName }} · {{ choice.branchName }}</span>
        </span>
        <span class="text-xs font-bold text-hela-green">Change</span>
      </button>
      <p v-else class="rounded-xl bg-hela-gold-100/70 p-3 text-sm text-[#6d5622]">No supermarkets are open on HelaMart right now.</p>

      <!-- Shopping area -->
      <div class="mt-2 flex items-center gap-2 text-xs" data-testid="area-line">
        <template v-if="area">
          <AppIcon name="pin" :size="13" class="shrink-0 text-hela-green" />
          <span class="min-w-0 truncate text-muted">
            Your area: <b class="text-ink">{{ area.label }}</b> · {{ area.radiusKm }} km<template v-if="currentBranch"> · {{ formatKm(currentBranch.distanceKm) }} away{{ currentBranch.delivers ? ', delivers to you' : '' }}</template>
          </span>
          <button type="button" class="ml-auto shrink-0 font-bold text-hela-green hover:underline" data-testid="change-area" @click="openFinder()">Change area</button>
        </template>
        <button v-else type="button" class="flex w-full items-center justify-center gap-2 rounded-xl bg-hela-green px-3 py-2 text-sm font-bold text-white shadow-card transition hover:bg-hela-green-900" data-testid="find-near-me" @click="openFinder()">
          <AppIcon name="map" :size="16" />Find supermarkets near you
        </button>
      </div>
    </template>

    <AdminModal :open="open" title="Where are you shopping?" description="Only HelaMart-verified supermarkets are listed." @close="open = false">
      <div class="space-y-4">
        <div class="flex items-center gap-2 rounded-xl bg-hela-green-50 px-3 py-2.5 text-sm">
          <AppIcon name="pin" :size="15" class="shrink-0 text-hela-green" />
          <span v-if="area" class="min-w-0 flex-1 text-ink">Near <b>{{ area.label }}</b> ({{ area.radiusKm }} km)</span>
          <span v-else class="min-w-0 flex-1 text-ink">Set your area to see the nearest supermarkets first.</span>
          <button type="button" class="shrink-0 text-xs font-bold text-hela-green hover:underline" @click="changeArea">{{ area ? 'Change area' : 'Set area' }}</button>
        </div>

        <fieldset>
          <legend class="field-label">Supermarket</legend>
          <p v-if="nearby && !nearby.length" class="mb-2 rounded-lg bg-hela-gold-100/70 p-2.5 text-xs text-[#6d5622]">No supermarkets within {{ area!.radiusKm }} km of {{ area!.label }} yet — these are the nearest.</p>
          <div class="grid gap-2 sm:grid-cols-2">
            <label v-for="s in listed" :key="s.id" class="flex cursor-pointer items-center gap-3 rounded-xl bg-white p-3 ring-1 transition" :class="storeId === s.id ? 'ring-2 ring-hela-green' : 'ring-line hover:bg-hela-green-50'">
              <input v-model="storeId" type="radio" name="store" :value="s.id" class="sr-only">
              <StoreBadge :name="s.name" :branding="s.branding" :color="s.brandColor" />
              <span class="min-w-0 flex-1">
                <span class="block truncate font-semibold text-ink">{{ s.name }}</span>
                <span class="block truncate text-xs text-muted">
                  <template v-if="distanceOf(s)">{{ distanceOf(s)!.name }} · {{ formatKm(distanceOf(s)!.distanceKm) }}</template>
                  <template v-else>{{ s.branding.slogan || `${s.branches.length} ${s.branches.length === 1 ? 'branch' : 'branches'}` }}</template>
                </span>
              </span>
              <span v-if="distanceOf(s)?.delivers" class="inline-flex shrink-0 items-center gap-1 rounded-full bg-hela-green-50 px-2 py-0.5 text-[0.65rem] font-bold text-hela-green"><AppIcon name="truck" :size="11" />Delivers</span>
              <span v-else class="inline-flex shrink-0 items-center gap-1 rounded-full bg-hela-green-50 px-2 py-0.5 text-[0.65rem] font-bold text-hela-green"><AppIcon name="shield" :size="11" />Verified</span>
            </label>
          </div>
          <button v-if="nearby?.length && far.length" type="button" class="mt-2 text-xs font-bold text-hela-green hover:underline" @click="showFar = !showFar">
            {{ showFar ? 'Hide supermarkets outside your area' : `Show ${far.length} more outside your area` }}
          </button>
        </fieldset>
        <fieldset v-if="store">
          <legend class="field-label">Branch</legend>
          <div class="grid gap-2 sm:grid-cols-2">
            <label
              v-for="b in branches"
              :key="b.id"
              class="flex items-start gap-2.5 rounded-xl bg-white p-3 text-sm ring-1 transition"
              :class="b.status !== 'open' ? 'cursor-not-allowed opacity-55' : branchId === b.id ? 'cursor-pointer ring-2 ring-hela-green' : 'cursor-pointer ring-line hover:bg-hela-green-50'"
            >
              <input v-model="branchId" type="radio" name="branch" :value="b.id" class="mt-0.5 accent-hela-green" :disabled="b.status !== 'open'">
              <span>
                <span class="block font-semibold text-ink">{{ b.name }}<template v-if="b.distanceKm !== undefined"> · {{ formatKm(b.distanceKm) }}</template></span>
                <span class="block text-xs text-muted">{{ b.city }}, {{ b.district }} · {{ b.status === 'open' ? b.hours : 'Temporarily closed' }}</span>
                <span v-if="b.delivers" class="mt-0.5 block text-xs font-semibold text-hela-green">Home delivery to your area</span>
              </span>
            </label>
          </div>
        </fieldset>
      </div>
      <template #footer>
        <button type="button" class="btn-ghost h-9" @click="open = false">Cancel</button>
        <button type="button" class="btn-primary h-9" :disabled="!branchId" @click="confirm">Shop here</button>
      </template>
    </AdminModal>
  </div>
</template>
