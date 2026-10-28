<script setup lang="ts">
withDefaults(defineProps<{ size?: 'sm' | 'md' | 'lg'; tagline?: boolean; inverted?: boolean }>(), {
  size: 'md',
  tagline: false,
  inverted: false,
})
</script>

<template>
  <div class="flex items-center gap-3" :class="inverted ? 'text-hela-gold' : 'text-hela-green'">
    <span
      class="grid shrink-0 place-items-center rounded-[14px] bg-hela-green text-hela-gold shadow-[0_8px_18px_-8px_rgb(23_77_56/0.6)]"
      :class="{ 'size-9 rounded-[11px]': size === 'sm', 'size-11': size === 'md', 'size-14 rounded-2xl': size === 'lg' }"
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" :class="size === 'lg' ? 'size-7' : size === 'md' ? 'size-6' : 'size-5'" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M2 4h3l2.4 10.4a1 1 0 0 0 1 .8h9.4a1 1 0 0 0 1-.8L21 8H6.2" />
        <circle cx="9.5" cy="19.5" r="1.4" fill="currentColor" />
        <circle cx="17" cy="19.5" r="1.4" fill="currentColor" />
      </svg>
    </span>
    <span class="flex flex-col leading-none">
      <span
        class="font-extrabold tracking-[-0.05em]"
        :class="{ 'text-lg': size === 'sm', 'text-2xl': size === 'md', 'text-3xl': size === 'lg' }"
      >HelaMart</span>
      <span
        v-if="tagline"
        class="mt-1 text-[0.72rem] font-semibold tracking-wide"
        :class="inverted ? 'text-cream/85' : 'text-hela-gold-600'"
      >Everything for Every Home.</span>
    </span>
  </div>
</template>
