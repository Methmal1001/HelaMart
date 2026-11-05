<script setup lang="ts">
import type { ShopRatingDto } from '~/services/apiTypes'

/** A supermarket's rating: "★ 4.6 (128)", or "New" until it has enough reviews for an average (the server decides). */
const props = defineProps<{ rating?: ShopRatingDto }>()
const count = computed(() => props.rating?.count ?? 0)
const reviews = computed(() => `${count.value} review${count.value === 1 ? '' : 's'}`)
</script>

<template>
  <span
    v-if="rating?.average !== undefined"
    class="inline-flex items-center gap-1 text-[0.7rem] font-bold text-ink"
    :aria-label="`Rated ${rating.average.toFixed(1)} out of 5 from ${reviews} in the last 12 months`"
    :title="`From ${reviews} in the last 12 months`"
    data-testid="shop-rating"
  >
    <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true" class="text-[#E0A526]"><path d="M12 2.6l2.9 5.9 6.5.95-4.7 4.58 1.11 6.47L12 17.46l-5.81 3.04 1.11-6.47L2.6 9.45l6.5-.95z" fill="currentColor" /></svg>
    <span aria-hidden="true">{{ rating.average.toFixed(1) }}</span>
    <span class="font-medium text-muted" aria-hidden="true">({{ count }})</span>
  </span>
  <span v-else class="inline-flex items-center text-[0.7rem] font-semibold text-muted" title="Not enough reviews yet for a rating" data-testid="shop-rating-new">New</span>
</template>
