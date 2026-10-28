<script setup lang="ts">
import type { Product } from '~/types'
import { getCategory } from '~/data/categories'

/**
 * Illustrated packshot drawn from the product's mock shape and colours, so
 * there are never broken images. When `product.image` exists it is used instead.
 */
const props = withDefaults(defineProps<{ product: Product; rounded?: string }>(), { rounded: 'rounded-xl' })

const tint = computed(() => getCategory(props.product.categoryId).color)
const word = computed(() => props.product.name.split(/\s+/)[0]!.slice(0, 9).toUpperCase())
const id = computed(() => `pt-${props.product.id}`)
</script>

<template>
  <div class="relative overflow-hidden" :class="rounded" :style="{ background: `color-mix(in srgb, ${tint} 12%, #fbfaf6)` }">
    <img v-if="product.image" :src="product.image" :alt="product.name" class="size-full object-contain p-2" loading="lazy" >
    <svg v-else viewBox="0 0 100 100" class="size-full" role="img" :aria-label="`${product.name} illustration`">
      <defs>
        <linearGradient :id="`${id}-shine`" x1="0" x2="1">
          <stop offset="0" stop-color="#000" stop-opacity="0.08" />
          <stop offset="0.35" stop-color="#fff" stop-opacity="0.22" />
          <stop offset="1" stop-color="#000" stop-opacity="0.12" />
        </linearGradient>
      </defs>
      <ellipse cx="50" cy="88" rx="30" ry="4" fill="#000" opacity="0.08" />

      <g v-if="product.shape === 'bottle'">
        <path d="M43 14h14v10l6 9v50a4 4 0 0 1-4 4H41a4 4 0 0 1-4-4V33l6-9z" :fill="product.color" stroke="#0000001a" />
        <rect x="42" y="9" width="16" height="7" rx="2" :fill="product.accent" />
        <rect x="37" y="48" width="26" height="22" :fill="product.accent" />
        <path d="M43 14h14v10l6 9v50a4 4 0 0 1-4 4H41a4 4 0 0 1-4-4V33l6-9z" :fill="`url(#${id}-shine)`" />
      </g>

      <g v-else-if="product.shape === 'can' || product.shape === 'roll'">
        <rect :x="product.shape === 'roll' ? 26 : 34" y="22" :width="product.shape === 'roll' ? 48 : 32" height="62" rx="5" :fill="product.color" stroke="#0000001a" />
        <rect :x="product.shape === 'roll' ? 26 : 34" y="40" :width="product.shape === 'roll' ? 48 : 32" height="26" :fill="product.accent" />
        <ellipse cx="50" cy="22" :rx="product.shape === 'roll' ? 24 : 16" ry="4" fill="#ffffff" opacity="0.6" />
        <rect :x="product.shape === 'roll' ? 26 : 34" y="22" :width="product.shape === 'roll' ? 48 : 32" height="62" rx="5" :fill="`url(#${id}-shine)`" />
      </g>

      <g v-else-if="product.shape === 'jar'">
        <rect x="30" y="20" width="40" height="10" rx="3" :fill="product.accent" />
        <rect x="28" y="29" width="44" height="55" rx="7" :fill="product.color" stroke="#0000001a" />
        <rect x="28" y="44" width="44" height="22" :fill="product.accent" opacity="0.9" />
        <rect x="28" y="29" width="44" height="55" rx="7" :fill="`url(#${id}-shine)`" />
      </g>

      <g v-else-if="product.shape === 'bag'">
        <path d="M27 18h46l-2 6c4 18 4 40 2 58H27c-2-18-2-40 2-58z" :fill="product.color" stroke="#0000001a" />
        <rect x="27" y="14" width="46" height="6" rx="1.5" :fill="product.accent" />
        <rect x="30" y="44" width="40" height="22" rx="4" :fill="product.accent" />
        <path d="M27 18h46l-2 6c4 18 4 40 2 58H27c-2-18-2-40 2-58z" :fill="`url(#${id}-shine)`" />
      </g>

      <g v-else-if="product.shape === 'carton'">
        <path d="M34 26 42 14h16l8 12v58H34z" :fill="product.color" stroke="#0000001a" />
        <rect x="34" y="46" width="32" height="22" :fill="product.accent" />
        <path d="M34 26 42 14h16l8 12v58H34z" :fill="`url(#${id}-shine)`" />
      </g>

      <g v-else-if="product.shape === 'tray'">
        <rect x="16" y="54" width="68" height="24" rx="5" fill="#F1EEE6" stroke="#0000001a" />
        <ellipse cx="38" cy="54" rx="16" ry="9" :fill="product.color" />
        <ellipse cx="60" cy="53" rx="15" ry="8" :fill="product.color" opacity="0.85" />
        <rect x="16" y="45" width="68" height="20" rx="6" fill="#ffffff" opacity="0.25" />
      </g>

      <g v-else-if="product.shape === 'loaf'">
        <path d="M20 52c0-14 13-22 30-22s30 8 30 22v26a4 4 0 0 1-4 4H24a4 4 0 0 1-4-4z" :fill="product.color" stroke="#0000001a" />
        <path d="M34 38c3 4 3 9 0 13M50 34c3 5 3 11 0 16M66 38c3 4 3 9 0 13" :stroke="product.accent" stroke-width="3" fill="none" stroke-linecap="round" />
      </g>

      <g v-else-if="product.shape === 'round'">
        <circle cx="38" cy="62" r="17" :fill="product.color" stroke="#0000001a" />
        <circle cx="62" cy="62" r="17" :fill="product.color" stroke="#0000001a" />
        <circle cx="50" cy="42" r="17" :fill="product.color" stroke="#0000001a" />
        <path d="M50 25c1-4 4-7 8-8" :stroke="product.accent" stroke-width="3" stroke-linecap="round" fill="none" />
        <circle cx="44" cy="37" r="4" fill="#fff" opacity="0.35" />
      </g>

      <g v-else-if="product.shape === 'long'">
        <g v-for="i in 3" :key="i" :transform="`rotate(${-18 + i * 9} 50 60)`">
          <ellipse :cx="50" :cy="44 + i * 9" rx="30" ry="6.5" :fill="product.color" stroke="#0000001a" />
          <circle :cx="78" :cy="44 + i * 9" r="3" :fill="product.accent" />
        </g>
      </g>

      <!-- box / tallBox -->
      <g v-else>
        <rect
          :x="product.shape === 'tallBox' ? 38 : 24"
          y="18"
          :width="product.shape === 'tallBox' ? 24 : 52"
          height="66"
          rx="3"
          :fill="product.color"
          stroke="#0000001a"
        />
        <rect :x="product.shape === 'tallBox' ? 38 : 24" y="42" :width="product.shape === 'tallBox' ? 24 : 52" height="22" :fill="product.accent" />
        <text
          v-if="product.shape !== 'tallBox'"
          x="50"
          y="56.5"
          text-anchor="middle"
          font-size="7.5"
          font-weight="800"
          :fill="product.color"
          font-family="Plus Jakarta Sans, sans-serif"
        >{{ word }}</text>
        <rect :x="product.shape === 'tallBox' ? 38 : 24" y="18" :width="product.shape === 'tallBox' ? 24 : 52" height="66" rx="3" :fill="`url(#${id}-shine)`" />
      </g>
    </svg>
  </div>
</template>
