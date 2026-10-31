<script setup lang="ts">
import { renderSVG } from 'uqr'

/** A crisp, scannable QR code (inline SVG — prints sharply on thermal and laser printers). */
const props = withDefaults(defineProps<{ value: string; size?: number; label?: string }>(), { size: 160 })
const svg = computed(() => renderSVG(props.value, { ecc: 'M', border: 2 }))
</script>

<template>
  <div class="qr-code inline-block bg-white leading-none" :style="{ width: `${size}px`, height: `${size}px` }" role="img" :aria-label="label ?? 'QR code'" v-html="svg" />
</template>

<style scoped>
.qr-code :deep(svg) {
  display: block;
  width: 100%;
  height: 100%;
  shape-rendering: crispEdges;
}
</style>
