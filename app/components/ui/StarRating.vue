<script setup lang="ts">
/** Five stars: shows a rating (fractions fill part of a star), or picks one when `editable` (keyboard-friendly radio group). */
const props = withDefaults(defineProps<{ modelValue: number; editable?: boolean; size?: number; label?: string }>(), { editable: false, size: 16, label: 'Rating' })
const emit = defineEmits<{ 'update:modelValue': [value: number] }>()

const STAR = 'M12 2.6l2.9 5.9 6.5.95-4.7 4.58 1.11 6.47L12 17.46l-5.81 3.04 1.11-6.47L2.6 9.45l6.5-.95z'
const hover = ref(0)
const shown = computed(() => hover.value || props.modelValue)
const fill = (star: number) => `${Math.max(0, Math.min(1, shown.value - star + 1)) * 100}%`
const WORDS = ['Terrible', 'Poor', 'OK', 'Good', 'Excellent']
const name = useId()
</script>

<template>
  <div
    v-if="editable"
    class="inline-flex items-center gap-1"
    role="radiogroup"
    :aria-label="label"
    @mouseleave="hover = 0"
  >
    <label v-for="star in 5" :key="star" class="relative cursor-pointer rounded focus-within:outline-3 focus-within:outline-hela-gold" :title="WORDS[star - 1]" @mouseenter="hover = star">
      <input type="radio" class="sr-only" :name="name" :value="star" :checked="modelValue === star" :aria-label="`${star} star${star === 1 ? '' : 's'}: ${WORDS[star - 1]}`" @change="emit('update:modelValue', star)">
      <svg :width="size" :height="size" viewBox="0 0 24 24" aria-hidden="true" class="transition" :class="star <= shown ? 'text-[#E0A526]' : 'text-line'"><path :d="STAR" fill="currentColor" /></svg>
    </label>
    <span class="ml-1 w-16 text-xs font-semibold text-muted">{{ shown ? WORDS[shown - 1] : '' }}</span>
  </div>
  <span v-else class="inline-flex items-center gap-0.5" role="img" :aria-label="`${modelValue} out of 5 stars`">
    <span v-for="star in 5" :key="star" class="relative inline-block" :style="{ width: `${size}px`, height: `${size}px` }" aria-hidden="true">
      <svg :width="size" :height="size" viewBox="0 0 24 24" class="absolute inset-0 text-line"><path :d="STAR" fill="currentColor" /></svg>
      <span class="absolute inset-y-0 left-0 overflow-hidden" :style="{ width: fill(star) }">
        <svg :width="size" :height="size" viewBox="0 0 24 24" class="max-w-none text-[#E0A526]"><path :d="STAR" fill="currentColor" /></svg>
      </span>
    </span>
  </span>
</template>
