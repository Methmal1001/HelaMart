<script setup lang="ts">
import type { Product } from '~/types'
import { getCategory } from '~/data/categories'

/**
 * Product picture: the supermarket's uploaded photo when there is one,
 * otherwise generated packaging artwork. Rendered client-side (canvas /
 * IndexedDB), with a soft placeholder during server rendering.
 */
const props = withDefaults(defineProps<{ product: Omit<Product, 'stock'>; rounded?: string }>(), { rounded: 'rounded-xl' })

const tint = computed(() => getCategory(props.product.categoryId).color)
const src = ref<string | null>(null)
const isPhoto = ref(false)

let loadSeq = 0
async function load() {
  if (import.meta.server) return
  const seq = ++loadSeq
  const p = props.product
  if (p.image) {
    const { resolveImageUrl } = await import('~/services/mock/mediaStore')
    const url = await resolveImageUrl(p.image)
    if (seq !== loadSeq) return
    if (url) {
      src.value = url
      isPhoto.value = true
      return
    }
  }
  const { productArtUrl } = await import('~/lib/productArt')
  if (seq !== loadSeq) return // a newer product/photo arrived meanwhile
  src.value = productArtUrl(p)
  isPhoto.value = false
}
onMounted(load)
watch(() => [props.product.id, props.product.image, props.product.color, props.product.accent, props.product.name], load)
</script>

<template>
  <div class="relative grid place-items-center overflow-hidden" :class="rounded" :style="{ background: `color-mix(in srgb, ${tint} 10%, #fbfaf6)` }">
    <img v-if="src" :src="src" :alt="`${product.name}${isPhoto ? '' : ' (illustration)'}`" class="absolute inset-0 size-full object-contain p-[8%] drop-shadow-[0_4px_6px_rgb(0_0_0/0.15)]" loading="lazy" decoding="async">
    <span v-else class="size-1/2 animate-pulse rounded-lg bg-white/60" aria-hidden="true" />
  </div>
</template>
