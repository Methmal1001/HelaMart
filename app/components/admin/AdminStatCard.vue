<script setup lang="ts">
import type { IconName } from '~/types'

defineProps<{ label: string; value: string; hint?: string; icon: IconName; tone?: 'green' | 'gold' | 'red' }>()
</script>

<template>
  <div class="card flex items-start gap-3 p-4">
    <span
      class="grid size-10 shrink-0 place-items-center rounded-xl"
      :class="tone === 'red' ? 'bg-[#FBEAEA] text-[#8A2E2E]' : tone === 'gold' ? 'bg-hela-gold-100 text-hela-gold-600' : 'bg-hela-green-50 text-hela-green'"
    >
      <AppIcon :name="icon" :size="19" />
    </span>
    <div class="min-w-0">
      <p class="text-xs font-semibold text-muted">{{ label }}</p>
      <p class="mt-0.5 truncate text-xl font-extrabold tracking-tight text-ink tabular-nums">{{ value }}</p>
      <p v-if="hint" class="mt-0.5 text-xs text-muted">{{ hint }}</p>
    </div>
  </div>
</template>
