<script setup lang="ts">
/** Thumbnails of a return's private photos (loaded with the viewer's token); tap one to see it large. */
const { ids, load } = defineProps<{ ids: string[]; load: (photoId: string) => Promise<string> }>()
const urls = ref<Record<string, string>>({})
const failed = ref<Record<string, boolean>>({})
const big = ref<string | null>(null)

watch(
  () => ids.join(','),
  async () => {
    for (const id of ids) {
      if (urls.value[id] || failed.value[id]) continue
      try {
        urls.value = { ...urls.value, [id]: await load(id) }
      } catch {
        failed.value = { ...failed.value, [id]: true }
      }
    }
  },
  { immediate: true },
)
onBeforeUnmount(() => Object.values(urls.value).forEach((u) => URL.revokeObjectURL(u)))
</script>

<template>
  <div v-if="ids.length" class="flex flex-wrap gap-2" data-testid="return-photos">
    <button
      v-for="id in ids"
      :key="id"
      type="button"
      class="grid size-16 place-items-center overflow-hidden rounded-xl bg-cream ring-1 ring-line hover:ring-hela-green"
      :aria-label="'View photo'"
      @click="urls[id] && (big = urls[id])"
    >
      <img v-if="urls[id]" :src="urls[id]" alt="Photo of the problem" class="size-full object-cover">
      <AppIcon v-else :name="failed[id] ? 'alert' : 'eye'" :size="16" class="text-muted" />
    </button>
    <Teleport to="body">
      <div v-if="big" class="fixed inset-0 z-[80] grid place-items-center bg-ink/70 p-4" role="dialog" aria-label="Photo" @click="big = null">
        <img :src="big" alt="Photo of the problem" class="max-h-[90dvh] max-w-full rounded-2xl shadow-float">
      </div>
    </Teleport>
  </div>
</template>
