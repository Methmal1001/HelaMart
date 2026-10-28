<script setup lang="ts">
/** Status pill — always text + colour (never colour alone). */
const props = defineProps<{ value: string; label?: string }>()

const TONES: Record<string, string> = {
  // orders
  pending: 'bg-[#FFF4D6] text-[#7A5600]',
  packing: 'bg-[#E3EEF9] text-[#1F4E7A]',
  out_for_delivery: 'bg-[#E3EEF9] text-[#1F4E7A]',
  ready_for_pickup: 'bg-[#E3EEF9] text-[#1F4E7A]',
  delivered: 'bg-hela-green-50 text-hela-green',
  cancelled: 'bg-[#F1F1EF] text-[#55595C]',
  refunded: 'bg-[#FBEAEA] text-[#8A2E2E]',
  // generic
  active: 'bg-hela-green-50 text-hela-green',
  paused: 'bg-[#F1F1EF] text-[#55595C]',
  hidden: 'bg-[#F1F1EF] text-[#55595C]',
  suspended: 'bg-[#FBEAEA] text-[#8A2E2E]',
  blocked: 'bg-[#FBEAEA] text-[#8A2E2E]',
  expired: 'bg-[#F1F1EF] text-[#55595C]',
  // tasks
  todo: 'bg-[#F1F1EF] text-[#55595C]',
  in_progress: 'bg-[#E3EEF9] text-[#1F4E7A]',
  done: 'bg-hela-green-50 text-hela-green',
  low: 'bg-[#F1F1EF] text-[#55595C]',
  medium: 'bg-[#E3EEF9] text-[#1F4E7A]',
  high: 'bg-[#FFF4D6] text-[#7A5600]',
  urgent: 'bg-[#FBEAEA] text-[#8A2E2E]',
  // audit
  info: 'bg-[#F1F1EF] text-[#55595C]',
  warning: 'bg-[#FFF4D6] text-[#7A5600]',
  critical: 'bg-[#FBEAEA] text-[#8A2E2E]',
  // stock
  in_stock: 'bg-hela-green-50 text-hela-green',
  low_stock: 'bg-[#FFF4D6] text-[#7A5600]',
  out_of_stock: 'bg-[#FBEAEA] text-[#8A2E2E]',
}

const text = computed(() => props.label ?? props.value.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()))
</script>

<template>
  <span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap" :class="TONES[value] ?? 'bg-cream text-ink'">
    {{ text }}
  </span>
</template>
