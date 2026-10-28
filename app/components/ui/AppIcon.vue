<script setup lang="ts">
import type { IconName } from '~/types'

const props = withDefaults(defineProps<{ name: IconName; size?: number | string; strokeWidth?: number }>(), {
  size: 20,
  strokeWidth: 2,
})

// Stroke icons on a 24×24 grid (Lucide-style, inlined to avoid a dependency).
const PATHS: Record<IconName, string[]> = {
  apple: ['M12 7c-1.5-1.6-5-1.8-6.4.9C4 11 5.6 17 8.3 19.4c1.2 1 2.4.8 3.7.2 1.3.6 2.5.8 3.7-.2C18.4 17 20 11 18.4 7.9 17 5.2 13.5 5.4 12 7Z', 'M12 7c0-2 .8-3.6 2.5-4.5'],
  bread: ['M5 11a4 4 0 0 1 1-7.8C8 2.6 10 3 12 3s4-.4 6 .2A4 4 0 0 1 19 11v8a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2Z'],
  milk: ['M8 2h8', 'M9 2v3.2L6.6 9A4 4 0 0 0 6 11v9a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-9a4 4 0 0 0-.6-2L15 5.2V2', 'M6 14h12'],
  snowflake: ['M12 2v20', 'M4.9 7l14.2 10', 'M4.9 17 19.1 7', 'm9 4 3 2 3-2', 'm9 20 3-2 3 2'],
  bottle: ['M10 2h4', 'M10 2v4l-2 3v11a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V9l-2-3V2', 'M8 13h8'],
  cookie: ['M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5', 'M8.5 8.5h.01', 'M16 15.5h.01', 'M12 12h.01', 'M11 17h.01', 'M7 14h.01'],
  wheat: ['M2 22 16 8', 'M3.5 12.5 5 11l1.5 1.5a3.5 3.5 0 0 1 0 5L5 19l-1.5-1.5a3.5 3.5 0 0 1 0-5Z', 'M7.5 8.5 9 7l1.5 1.5a3.5 3.5 0 0 1 0 5L9 15l-1.5-1.5a3.5 3.5 0 0 1 0-5Z', 'M11.5 4.5 13 3l1.5 1.5a3.5 3.5 0 0 1 0 5L13 11l-1.5-1.5a3.5 3.5 0 0 1 0-5Z', 'M20 2h2v2a4 4 0 0 1-4 4h-2V6a4 4 0 0 1 4-4Z'],
  spray: ['M3 3h.01', 'M7 5h.01', 'M11 7h.01', 'M3 7h.01', 'M7 9h.01', 'M3 11h.01', 'M9 3h6v4H9z', 'M12 7v3', 'M8 10h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z'],
  sparkle: ['M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9Z', 'M19 17v4', 'M17 19h4'],
  home: ['M3 10.5 12 3l9 7.5', 'M5 9v11a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9'],
  cart: ['M2 3h3l2.6 12.4a1 1 0 0 0 1 .8h9.7a1 1 0 0 0 1-.8L21 7H6', 'M9 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z', 'M18 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z'],
  basket: ['m5 11 4-7', 'm19 11-4-7', 'M2 11h20', 'm3.5 11 1.6 7.4a2 2 0 0 0 2 1.6h9.8a2 2 0 0 0 2-1.6l1.6-7.4', 'M9 15v2', 'M15 15v2'],
  close: ['M18 6 6 18', 'M6 6l12 12'],
  plus: ['M12 5v14', 'M5 12h14'],
  minus: ['M5 12h14'],
  trash: ['M3 6h18', 'M8 6V4h8v2', 'M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6', 'M10 11v6', 'M14 11v6'],
  search: ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z', 'm21 21-4.3-4.3'],
  map: ['M9 3 3 6v15l6-3 6 3 6-3V3l-6 3-6-3Z', 'M9 3v15', 'M15 6v15'],
  list: ['M8 6h13', 'M8 12h13', 'M8 18h13', 'M3 6h.01', 'M3 12h.01', 'M3 18h.01'],
  mouse: ['M12 2a6 6 0 0 0-6 6v8a6 6 0 0 0 12 0V8a6 6 0 0 0-6-6Z', 'M12 6v4'],
  settings: ['M4 21v-7', 'M4 10V3', 'M12 21v-9', 'M12 8V3', 'M20 21v-5', 'M20 12V3', 'M1 14h6', 'M9 8h6', 'M17 16h6'],
  check: ['M20 6 9 17l-5-5'],
  'arrow-right': ['M5 12h14', 'm12 5 7 7-7 7'],
  'arrow-left': ['M19 12H5', 'm12 19-7-7 7-7'],
  door: ['M3 21h18', 'M5 21V4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v17', 'M12 3v18', 'M10 12h.01', 'M14 12h.01'],
  info: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z', 'M12 16v-4', 'M12 8h.01'],
  pin: ['M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12Z', 'M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z'],
  keyboard: ['M3 6h18a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z', 'M6 10h.01', 'M10 10h.01', 'M14 10h.01', 'M18 10h.01', 'M7 14h10'],
  alert: ['M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z', 'M12 9v4', 'M12 17h.01'],
  user: ['M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2', 'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z'],
  eye: ['M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z'],
}

const paths = computed(() => PATHS[props.name])
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    :stroke-width="strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
    class="shrink-0"
  >
    <path v-for="(d, i) in paths" :key="i" :d="d" />
  </svg>
</template>
