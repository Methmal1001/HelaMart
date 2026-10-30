<script setup lang="ts">
import type { Offer } from '~/types'

/**
 * Supermarket-style coupon: a bold "20% OFF" stub with a perforated edge,
 * what it's for, its conditions and when it ends. Used on the shopper side
 * and as the live preview in the admin offer editor.
 */
const props = withDefaults(defineProps<{ offer: Offer; compact?: boolean; applied?: boolean }>(), { compact: false, applied: false })

const STYLES: Record<string, { bg: string; fg: string }> = {
  'percent-category': { bg: 'linear-gradient(135deg,#E23B3B,#B3162B)', fg: '#FFF4D6' },
  'percent-product': { bg: 'linear-gradient(135deg,#F25C2A,#C2361A)', fg: '#FFF4D6' },
  'percent-order': { bg: 'linear-gradient(135deg,#7A2E8E,#4E1C6B)', fg: '#FFE9A8' },
  'fixed-off': { bg: 'linear-gradient(135deg,#174D38,#0E3426)', fg: '#E1C987' },
  bxgy: { bg: 'linear-gradient(135deg,#F2B33D,#D88A12)', fg: '#3A2400' },
  'free-delivery': { bg: 'linear-gradient(135deg,#1F7F8C,#145761)', fg: '#E8FBFF' },
}
const style = computed(() => STYLES[props.offer.rule.kind] ?? STYLES['fixed-off']!)
const headline = computed(() => offerHeadline(props.offer.rule))
const chips = computed(() => offerConditionChips(props.offer))
const ends = computed(() => {
  const t = Date.parse(props.offer.expiresAt)
  const days = Math.ceil((t - Date.now()) / 864e5)
  return days <= 3 ? (days <= 1 ? 'Ends today' : `Ends in ${days} days`) : `Until ${new Date(t).toLocaleDateString('en-LK', { day: 'numeric', month: 'short' })}`
})
const endingSoon = computed(() => Date.parse(props.offer.expiresAt) - Date.now() < 3 * 864e5)
</script>

<template>
  <article class="relative flex overflow-hidden rounded-2xl bg-white shadow-card ring-1 ring-black/5" :class="compact ? 'min-h-24' : 'min-h-32'">
    <!-- Stub -->
    <div class="relative flex shrink-0 flex-col items-center justify-center px-3 text-center" :class="compact ? 'w-24' : 'w-32'" :style="{ background: style.bg, color: style.fg }">
      <span class="pointer-events-none absolute inset-0 opacity-20" style="background: radial-gradient(circle at 20% 15%, #fff 0 18%, transparent 19%), radial-gradient(circle at 85% 90%, #fff 0 14%, transparent 15%)" aria-hidden="true" />
      <span class="relative leading-none font-black tracking-tight" :class="headline.length > 9 ? (compact ? 'text-base' : 'text-xl') : compact ? 'text-2xl' : 'text-3xl'">{{ headline }}</span>
      <span v-if="offer.code" class="relative mt-1.5 rounded border border-dashed px-1.5 py-0.5 text-[0.6rem] font-bold tracking-wider opacity-90" :style="{ borderColor: style.fg }">{{ offer.code }}</span>
    </div>
    <!-- Perforation -->
    <div class="relative w-0 border-l-2 border-dashed border-line" aria-hidden="true">
      <span class="absolute -top-2 -left-2 size-4 rounded-full bg-warm-white ring-1 ring-black/5" />
      <span class="absolute -bottom-2 -left-2 size-4 rounded-full bg-warm-white ring-1 ring-black/5" />
    </div>
    <!-- Details -->
    <div class="flex min-w-0 flex-1 flex-col p-3" :class="compact ? '' : 'sm:p-4'">
      <div class="flex items-start justify-between gap-2">
        <p class="min-w-0 text-[0.65rem] font-bold tracking-wide text-muted uppercase">{{ offer.storeName ?? 'HelaMart offer' }}</p>
        <span v-if="applied" class="inline-flex shrink-0 items-center gap-1 rounded-full bg-hela-green px-2 py-0.5 text-[0.6rem] font-bold text-white"><AppIcon name="check" :size="10" />Applied</span>
        <span v-else-if="endingSoon" class="shrink-0 rounded-full bg-[#FBEAEA] px-2 py-0.5 text-[0.6rem] font-bold text-[#8A2E2E]">Ending soon</span>
      </div>
      <p class="mt-0.5 font-bold text-ink" :class="compact ? 'line-clamp-1 text-sm' : 'line-clamp-2'">{{ offer.title }}</p>
      <p class="truncate text-xs text-muted">{{ offerSubject(offer.rule) }}</p>
      <div v-if="chips.length" class="mt-1.5 flex flex-wrap gap-1">
        <span v-for="c in chips" :key="c" class="rounded-md bg-cream px-1.5 py-0.5 text-[0.65rem] font-semibold text-ink">{{ c }}</span>
      </div>
      <p class="mt-auto pt-1.5 text-[0.7rem] font-semibold" :class="endingSoon ? 'text-[#8A2E2E]' : 'text-muted'">{{ ends }}</p>
    </div>
  </article>
</template>
