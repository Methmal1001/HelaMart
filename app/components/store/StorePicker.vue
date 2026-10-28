<script setup lang="ts">
/** "Where are you shopping?" — pick a verified supermarket and branch. */
withDefaults(defineProps<{ compact?: boolean }>(), { compact: false })
const { choice, stores, refresh, select } = useStoreSelection()
const open = ref(false)
const storeId = ref('')
const branchId = ref('')
const loaded = ref(false)

onMounted(() => {
  refresh()
  loaded.value = true
})

const store = computed(() => stores.value.find((s) => s.id === storeId.value))
function start() {
  storeId.value = choice.value?.storeId ?? stores.value[0]?.id ?? ''
  branchId.value = choice.value?.branchId ?? ''
  open.value = true
}
watch(storeId, () => {
  if (!store.value?.branches.some((b) => b.id === branchId.value)) branchId.value = store.value?.branches.find((b) => b.status === 'open')?.id ?? ''
})
function confirm() {
  select(storeId.value, branchId.value)
  open.value = false
}
</script>

<template>
  <div>
    <div v-if="!loaded" class="h-12 animate-pulse rounded-xl bg-hela-green-50" aria-hidden="true" />
    <button
      v-else-if="choice"
      type="button"
      class="flex w-full items-center gap-3 rounded-xl bg-white text-left ring-1 ring-line transition hover:ring-hela-green"
      :class="compact ? 'px-3 py-2' : 'px-3.5 py-2.5'"
      :aria-label="`Shopping at ${choice.storeName}, ${choice.branchName}. Change store`"
      @click="start"
    >
      <span class="grid size-9 shrink-0 place-items-center rounded-lg text-white" :style="{ background: choice.brandColor }"><AppIcon name="store" :size="17" /></span>
      <span class="min-w-0 flex-1">
        <span class="block text-[0.7rem] font-semibold tracking-wide text-muted uppercase">Shopping at</span>
        <span class="block truncate text-sm font-bold text-ink">{{ choice.storeName }} · {{ choice.branchName }}</span>
      </span>
      <span class="text-xs font-bold text-hela-green">Change</span>
    </button>
    <p v-else class="rounded-xl bg-hela-gold-100/70 p-3 text-sm text-[#6d5622]">No supermarkets are open on HelaMart right now.</p>

    <AdminModal :open="open" title="Where are you shopping?" description="Only HelaMart-verified supermarkets are listed." @close="open = false">
      <div class="space-y-4">
        <fieldset>
          <legend class="field-label">Supermarket</legend>
          <div class="grid gap-2 sm:grid-cols-2">
            <label v-for="s in stores" :key="s.id" class="flex cursor-pointer items-center gap-3 rounded-xl bg-white p-3 ring-1 transition" :class="storeId === s.id ? 'ring-2 ring-hela-green' : 'ring-line hover:bg-hela-green-50'">
              <input v-model="storeId" type="radio" name="store" :value="s.id" class="sr-only">
              <span class="grid size-9 shrink-0 place-items-center rounded-lg text-white" :style="{ background: s.brandColor }"><AppIcon name="store" :size="17" /></span>
              <span class="min-w-0"><span class="block truncate font-semibold text-ink">{{ s.name }}</span><span class="block text-xs text-muted">{{ s.branches.length }} {{ s.branches.length === 1 ? 'branch' : 'branches' }}</span></span>
              <span class="ml-auto inline-flex items-center gap-1 rounded-full bg-hela-green-50 px-2 py-0.5 text-[0.65rem] font-bold text-hela-green"><AppIcon name="shield" :size="11" />Verified</span>
            </label>
          </div>
        </fieldset>
        <fieldset v-if="store">
          <legend class="field-label">Branch</legend>
          <div class="grid gap-2 sm:grid-cols-2">
            <label
              v-for="b in store.branches"
              :key="b.id"
              class="flex items-start gap-2.5 rounded-xl bg-white p-3 text-sm ring-1 transition"
              :class="b.status !== 'open' ? 'cursor-not-allowed opacity-55' : branchId === b.id ? 'cursor-pointer ring-2 ring-hela-green' : 'cursor-pointer ring-line hover:bg-hela-green-50'"
            >
              <input v-model="branchId" type="radio" name="branch" :value="b.id" class="mt-0.5 accent-hela-green" :disabled="b.status !== 'open'">
              <span><span class="block font-semibold text-ink">{{ b.name }}</span><span class="block text-xs text-muted">{{ b.city }}, {{ b.district }} · {{ b.status === 'open' ? b.hours : 'Temporarily closed' }}</span></span>
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
