<script setup lang="ts">
import { MAX_LINE_QUANTITY } from '~/composables/useCart'

const props = withDefaults(defineProps<{ modelValue: number; min?: number; label: string; size?: 'sm' | 'md' }>(), {
  min: 1,
  size: 'md',
})
const emit = defineEmits<{ 'update:modelValue': [value: number] }>()

function set(v: number) {
  emit('update:modelValue', Math.max(props.min, Math.min(MAX_LINE_QUANTITY, v)))
}

function onInput(e: Event) {
  const v = Number.parseInt((e.target as HTMLInputElement).value, 10)
  if (Number.isFinite(v)) set(v)
}
</script>

<template>
  <div
    class="inline-flex items-center rounded-xl bg-white ring-1 ring-line"
    :class="size === 'sm' ? 'h-9' : 'h-11'"
    role="group"
    :aria-label="`Quantity for ${label}`"
  >
    <button
      type="button"
      class="grid h-full place-items-center rounded-l-xl text-ink transition hover:bg-hela-green-50 disabled:opacity-35"
      :class="size === 'sm' ? 'w-8' : 'w-11'"
      :disabled="modelValue <= min"
      :aria-label="`Decrease quantity of ${label}`"
      @click="set(modelValue - 1)"
    >
      <AppIcon name="minus" :size="16" />
    </button>
    <input
      :value="modelValue"
      type="number"
      inputmode="numeric"
      :min="min"
      :max="MAX_LINE_QUANTITY"
      class="h-full w-10 border-0 bg-transparent text-center text-sm font-bold tabular-nums text-ink [appearance:textfield] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none"
      :aria-label="`Quantity of ${label}`"
      @change="onInput"
    >
    <button
      type="button"
      class="grid h-full place-items-center rounded-r-xl text-ink transition hover:bg-hela-green-50 disabled:opacity-35"
      :class="size === 'sm' ? 'w-8' : 'w-11'"
      :disabled="modelValue >= MAX_LINE_QUANTITY"
      :aria-label="`Increase quantity of ${label}`"
      @click="set(modelValue + 1)"
    >
      <AppIcon name="plus" :size="16" />
    </button>
  </div>
</template>
