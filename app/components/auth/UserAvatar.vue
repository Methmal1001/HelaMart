<script setup lang="ts">
const props = withDefaults(defineProps<{ name: string; color?: string; picture?: string; size?: number }>(), {
  color: '#174D38',
  size: 36,
})
const initials = computed(() =>
  props.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join(''),
)
</script>

<template>
  <span
    class="grid shrink-0 place-items-center overflow-hidden rounded-full font-bold text-white ring-2 ring-white"
    :style="{ width: `${size}px`, height: `${size}px`, background: color, fontSize: `${size * 0.38}px` }"
    aria-hidden="true"
  >
    <img v-if="picture" :src="picture" alt="" class="size-full object-cover" referrerpolicy="no-referrer">
    <template v-else>{{ initials }}</template>
  </span>
</template>
