<script setup lang="ts">
const { progress } = useStoreExperience()
const pct = computed(() => Math.round(progress.value.value * 100))
</script>

<template>
  <div class="absolute inset-0 z-30 grid place-items-center bg-cream" role="status" aria-live="polite">
    <div class="flex w-72 flex-col items-center text-center">
      <BrandLogo size="lg" tagline />
      <div class="mt-10 h-1.5 w-full overflow-hidden rounded-full bg-hela-green/10" aria-hidden="true">
        <div class="h-full rounded-full bg-hela-green transition-[width] duration-300" :style="{ width: `${Math.max(6, pct)}%` }" />
      </div>
      <p class="mt-3 text-sm font-semibold text-muted">{{ progress.label }}…</p>
      <span class="sr-only">{{ pct }}% loaded</span>
    </div>
  </div>
</template>
