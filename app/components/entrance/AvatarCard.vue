<script setup lang="ts">
import type { AvatarKind } from '~/types'

defineProps<{ kind: AvatarKind; label: string; description: string; selected: boolean; portrait?: string }>()
defineEmits<{ select: [] }>()
</script>

<template>
  <button
    type="button"
    class="group relative flex flex-col items-center overflow-hidden rounded-2xl bg-white p-2.5 pb-3 text-center ring-1 transition duration-200 ease-[cubic-bezier(.2,.8,.2,1)] hover:-translate-y-0.5"
    :class="selected ? 'ring-2 ring-hela-green shadow-[0_0_0_5px_rgb(23_77_56/0.09)]' : 'ring-line hover:ring-[#c8d3ca] hover:shadow-card'"
    :aria-pressed="selected"
    @click="$emit('select')"
  >
    <span
      class="absolute top-2.5 right-2.5 z-10 grid size-6 place-items-center rounded-full transition"
      :class="selected ? 'scale-100 bg-hela-green text-hela-gold' : 'scale-90 bg-white text-transparent ring-1 ring-line'"
      aria-hidden="true"
    >
      <AppIcon name="check" :size="14" :stroke-width="3" />
    </span>
    <span
      class="relative grid h-28 w-full place-items-center overflow-hidden rounded-xl sm:h-36"
      :class="selected ? 'bg-[radial-gradient(circle_at_50%_70%,#f6eed6,#eef4ef_70%)]' : 'bg-hela-green-50'"
    >
      <img
        v-if="portrait"
        :src="portrait"
        :alt="`${label} preview`"
        class="h-full w-auto object-contain drop-shadow-[0_6px_8px_rgb(23_53_42/0.18)] transition duration-300 group-hover:scale-[1.03]"
      >
      <AppIcon v-else name="user" :size="48" :stroke-width="1.5" class="text-hela-green/40" />
    </span>
    <strong class="mt-2.5 block text-sm font-bold text-ink">{{ label }}</strong>
    <small class="text-xs text-muted">{{ selected ? 'Selected' : description }}</small>
  </button>
</template>
