<script setup lang="ts">
const props = defineProps<{ reason: 'unsupported' | 'error' }>()

function reload() {
  window.location.reload()
}
</script>

<template>
  <div class="absolute inset-0 z-30 grid place-items-center overflow-y-auto bg-cream px-5 py-10">
    <div class="w-full max-w-md rounded-3xl bg-white p-7 text-center shadow-card ring-1 ring-line">
      <div class="mx-auto mb-5 grid size-14 place-items-center rounded-2xl bg-hela-gold-100 text-hela-gold-600">
        <AppIcon name="alert" :size="26" />
      </div>
      <h1 class="text-xl font-extrabold tracking-tight text-ink">
        {{ props.reason === 'unsupported' ? '3D view isn’t available on this device' : 'The 3D store couldn’t start' }}
      </h1>
      <p class="mt-2 text-sm leading-relaxed text-muted">
        <template v-if="props.reason === 'unsupported'">
          Your browser or device doesn’t support WebGL, which the virtual store needs. You can still browse every aisle and shop normally.
        </template>
        <template v-else>
          The graphics context was lost or failed to initialise. Try reloading, or switch to the aisle list to keep shopping.
        </template>
      </p>
      <div class="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
        <NuxtLink to="/browse" class="btn-primary">
          <AppIcon name="list" :size="18" />
          Browse the aisles
        </NuxtLink>
        <button v-if="props.reason === 'error'" type="button" class="btn-ghost" @click="reload">Reload 3D store</button>
      </div>
    </div>
  </div>
</template>
