<script setup lang="ts">
import { formatKm, rankStores, type RankedBranch } from '~/lib/area'
import type { PublicStore } from '~/services/partnerService'

/**
 * "Where are you shopping?" — only supermarkets whose delivery area covers the
 * shopper's area can be chosen; the rest are shown greyed out with the reason.
 */
withDefaults(defineProps<{ compact?: boolean }>(), { compact: false })
const { choice, stores, currentStore, choiceServesArea, refresh, select } = useStoreSelection()
const { area, openFinder } = useShoppingArea()
const open = ref(false)
const storeId = ref('')
const branchId = ref('')
const loaded = ref(false)
const showUnavailable = ref(false)

onMounted(() => {
  refresh()
  loaded.value = true
})

const ranked = computed(() => (area.value ? rankStores(stores.value, area.value) : null))
const available = computed(() => ranked.value?.filter((r) => r.available) ?? null)
const unavailable = computed(() => ranked.value?.filter((r) => !r.available) ?? [])
const rankOf = (s: PublicStore) => ranked.value?.find((r) => r.store.id === s.id)
const store = computed(() => stores.value.find((s) => s.id === storeId.value))
const storeSelectable = computed(() => !area.value || (!!store.value && !!rankOf(store.value)?.available))
const branches = computed<(PublicStore['branches'][number] & Partial<RankedBranch>)[]>(() => {
  if (!store.value) return []
  return rankOf(store.value)?.branches ?? store.value.branches
})
const branchUsable = (b: (typeof branches.value)[number]) => b.status === 'open' && (!area.value || !!b.delivers)
const currentBranch = computed(() => (area.value && currentStore.value ? rankOf(currentStore.value)?.branches.find((b) => b.id === choice.value?.branchId) : undefined))

function start() {
  storeId.value = choice.value?.storeId ?? available.value?.[0]?.store.id ?? stores.value[0]?.id ?? ''
  branchId.value = choice.value?.branchId ?? ''
  showUnavailable.value = false
  open.value = true
}
watch([storeId, () => area.value?.label], () => {
  if (!branches.value.some((b) => b.id === branchId.value && branchUsable(b))) branchId.value = branches.value.find(branchUsable)?.id ?? ''
})
function confirm() {
  if (!storeSelectable.value || !branchId.value) return
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
        class="flex w-full items-center gap-3 rounded-xl bg-white text-left ring-1 transition hover:ring-hela-green"
        :class="[compact ? 'px-3 py-2' : 'px-3.5 py-2.5', choiceServesArea === false ? 'ring-[#E7B4B4]' : 'ring-line']"
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

      <!-- Shopping area + availability -->
      <div class="mt-2 text-xs" data-testid="area-line">
        <div v-if="area" class="flex items-center gap-2">
          <AppIcon name="pin" :size="13" class="shrink-0" :class="choiceServesArea === false ? 'text-[#8A2E2E]' : 'text-hela-green'" />
          <span class="min-w-0 truncate" :class="choiceServesArea === false ? 'font-semibold text-[#8A2E2E]' : 'text-muted'" data-testid="availability">
            <template v-if="choiceServesArea === false">Doesn’t deliver to {{ area.label }} — choose another supermarket</template>
            <template v-else>Delivers to <b class="text-ink">{{ area.label }}</b><template v-if="currentBranch"> · {{ formatKm(currentBranch.distanceKm) }} away</template></template>
          </span>
          <button type="button" class="ml-auto shrink-0 font-bold text-hela-green hover:underline" data-testid="change-area" @click="openFinder()">Change area</button>
        </div>
        <button v-else type="button" class="flex w-full items-center justify-center gap-2 rounded-xl bg-hela-green px-3 py-2 text-sm font-bold text-white shadow-card transition hover:bg-hela-green-900" data-testid="find-near-me" @click="openFinder()">
          <AppIcon name="map" :size="16" />Find supermarkets near you
        </button>
      </div>
    </template>

    <AdminModal :open="open" title="Where are you shopping?" description="Only HelaMart-verified supermarkets that deliver to your area can be chosen." @close="open = false">
      <div class="space-y-4">
        <div class="flex items-center gap-2 rounded-xl bg-hela-green-50 px-3 py-2.5 text-sm">
          <AppIcon name="pin" :size="15" class="shrink-0 text-hela-green" />
          <span v-if="area" class="min-w-0 flex-1 text-ink">Delivering to <b>{{ area.label }}</b>, {{ area.district }}</span>
          <span v-else class="min-w-0 flex-1 text-ink">Set your area to check which supermarkets deliver to you.</span>
          <button type="button" class="shrink-0 text-xs font-bold text-hela-green hover:underline" @click="changeArea">{{ area ? 'Change area' : 'Set area' }}</button>
        </div>

        <fieldset>
          <legend class="field-label">Supermarket</legend>
          <p v-if="available && !available.length" class="mb-2 rounded-lg bg-[#FBEAEA] p-2.5 text-xs text-[#8A2E2E]">No HelaMart supermarket delivers to {{ area!.label }} yet. Try a nearby town.</p>
          <div class="grid gap-2 sm:grid-cols-2">
            <label
              v-for="s in available ? available.map((r) => r.store) : stores"
              :key="s.id"
              class="flex cursor-pointer items-center gap-3 rounded-xl bg-white p-3 ring-1 transition"
              :class="storeId === s.id ? 'ring-2 ring-hela-green' : 'ring-line hover:bg-hela-green-50'"
            >
              <input v-model="storeId" type="radio" name="store" :value="s.id" class="sr-only">
              <StoreBadge :name="s.name" :branding="s.branding" :color="s.brandColor" />
              <span class="min-w-0 flex-1">
                <span class="block truncate font-semibold text-ink">{{ s.name }}</span>
                <span class="block truncate text-xs text-muted">
                  <template v-if="rankOf(s)?.serving">{{ rankOf(s)!.serving!.name }} · {{ formatKm(rankOf(s)!.serving!.distanceKm) }}</template>
                  <template v-else>{{ s.branding.slogan || `${s.branches.length} ${s.branches.length === 1 ? 'branch' : 'branches'}` }}</template>
                </span>
              </span>
              <span v-if="area" class="inline-flex shrink-0 items-center gap-1 rounded-full bg-hela-green-50 px-2 py-0.5 text-[0.65rem] font-bold text-hela-green"><AppIcon name="truck" :size="11" />Delivers</span>
              <span v-else class="inline-flex shrink-0 items-center gap-1 rounded-full bg-hela-green-50 px-2 py-0.5 text-[0.65rem] font-bold text-hela-green"><AppIcon name="shield" :size="11" />Verified</span>
            </label>
          </div>
          <template v-if="area && unavailable.length">
            <button type="button" class="mt-2 text-xs font-bold text-hela-green hover:underline" @click="showUnavailable = !showUnavailable">
              {{ showUnavailable ? 'Hide' : 'Show' }} {{ unavailable.length }} supermarket{{ unavailable.length === 1 ? '' : 's' }} not delivering to {{ area.label }}
            </button>
            <ul v-if="showUnavailable" class="mt-2 grid gap-1.5 sm:grid-cols-2" data-testid="unavailable-stores">
              <li v-for="r in unavailable" :key="r.store.id" class="flex items-center gap-2.5 rounded-xl bg-cream/70 p-2.5 text-xs opacity-75" aria-disabled="true">
                <StoreBadge :name="r.store.name" :branding="r.store.branding" :color="r.store.brandColor" size="size-7" />
                <span class="min-w-0"><span class="block truncate font-semibold text-ink">{{ r.store.name }}</span><span class="block text-muted">Not available in {{ area.label }} · nearest {{ formatKm(r.nearest.distanceKm) }}</span></span>
              </li>
            </ul>
          </template>
        </fieldset>
        <fieldset v-if="store && storeSelectable">
          <legend class="field-label">Branch</legend>
          <div class="grid gap-2 sm:grid-cols-2">
            <label
              v-for="b in branches"
              :key="b.id"
              class="flex items-start gap-2.5 rounded-xl bg-white p-3 text-sm ring-1 transition"
              :class="!branchUsable(b) ? 'cursor-not-allowed opacity-55 ring-line' : branchId === b.id ? 'cursor-pointer ring-2 ring-hela-green' : 'cursor-pointer ring-line hover:bg-hela-green-50'"
            >
              <input v-model="branchId" type="radio" name="branch" :value="b.id" class="mt-0.5 accent-hela-green" :disabled="!branchUsable(b)">
              <span>
                <span class="block font-semibold text-ink">{{ b.name }}<template v-if="b.distanceKm !== undefined"> · {{ formatKm(b.distanceKm) }}</template></span>
                <span class="block text-xs text-muted">{{ b.city }}, {{ b.district }} · {{ b.status === 'open' ? b.hours : 'Temporarily closed' }}</span>
                <span v-if="area && b.status === 'open'" class="mt-0.5 block text-xs font-semibold" :class="b.delivers ? 'text-hela-green' : 'text-[#8A2E2E]'">{{ b.delivers ? `Delivers to ${area.label}` : `Doesn’t deliver to ${area.label}` }}</span>
              </span>
            </label>
          </div>
        </fieldset>
      </div>
      <template #footer>
        <button type="button" class="btn-ghost h-9" @click="open = false">Cancel</button>
        <button type="button" class="btn-primary h-9" :disabled="!branchId || !storeSelectable" @click="confirm">Shop here</button>
      </template>
    </AdminModal>
  </div>
</template>
