<script setup lang="ts">
import type { Offer } from '~/types'
import type { BrandingProfile } from '~/types/admin'
import { shadeHex, textOn } from '~/lib/branding'

/**
 * Supermarket-style coupon: a bold "20% OFF" stub with a perforated edge,
 * the supermarket's logo and theme colours, what it's for, its conditions and
 * when it ends (or starts, for "coming soon" offers). Used on the shopper
 * side and as the live preview in the admin offer editor.
 */
const props = withDefaults(defineProps<{ offer: Offer; compact?: boolean; applied?: boolean }>(), { compact: false, applied: false })

/** Fallback colours (HelaMart's own personal offers) by offer type. */
const BY_KIND: Record<string, { bg: string; fg: string }> = {
  'percent-category': { bg: 'linear-gradient(135deg,#E23B3B,#B3162B)', fg: '#FFF4D6' },
  'percent-product': { bg: 'linear-gradient(135deg,#F25C2A,#C2361A)', fg: '#FFF4D6' },
  'percent-order': { bg: 'linear-gradient(135deg,#7A2E8E,#4E1C6B)', fg: '#FFE9A8' },
  'fixed-off': { bg: 'linear-gradient(135deg,#174D38,#0E3426)', fg: '#E1C987' },
  bxgy: { bg: 'linear-gradient(135deg,#F2B33D,#D88A12)', fg: '#3A2400' },
  'free-delivery': { bg: 'linear-gradient(135deg,#1F7F8C,#145761)', fg: '#E8FBFF' },
}

const theme = computed(() => props.offer.storeTheme)
/** The supermarket's theme on the stub; its accent highlights the code. */
const stub = computed(() => {
  const t = theme.value
  if (!t) return BY_KIND[props.offer.rule.kind] ?? BY_KIND['fixed-off']!
  return { bg: `linear-gradient(135deg, ${shadeHex(t.primaryColor, 0.1)}, ${shadeHex(t.primaryColor, -0.3)})`, fg: textOn(t.primaryColor) }
})
/** Store name in its own colour, darkened enough to read on white. */
const nameColor = computed(() => (theme.value ? (textOn(theme.value.primaryColor) === '#FFFFFF' ? theme.value.primaryColor : shadeHex(theme.value.primaryColor, -0.55)) : undefined))
const badgeBranding = computed<BrandingProfile | null>(() => (theme.value ? { primaryColor: theme.value.primaryColor, logo: theme.value.logo, slogan: '', promoBanners: [], logoOnFixtures: false } : null))

const headline = computed(() => offerHeadline(props.offer.rule))
const chips = computed(() => offerConditionChips(props.offer).filter((c) => !c.startsWith('Starts')))
const fmt = (t: number) => new Date(t).toLocaleString('en-LK', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
const startsAt = computed(() => (props.offer.conditions?.startsAt ? Date.parse(props.offer.conditions.startsAt) : 0))
const upcoming = computed(() => !!props.offer.upcoming || startsAt.value > Date.now())
const when = computed(() => {
  if (upcoming.value) return `Starts ${fmt(startsAt.value)}`
  const t = Date.parse(props.offer.expiresAt)
  const hours = (t - Date.now()) / 36e5
  if (hours <= 24) return `Ends ${new Date(t).toLocaleTimeString('en-LK', { hour: 'numeric', minute: '2-digit' })} today`
  if (hours <= 72) return `Ends in ${Math.ceil(hours / 24)} days`
  return `Until ${new Date(t).toLocaleDateString('en-LK', { day: 'numeric', month: 'short' })}`
})
const endingSoon = computed(() => !upcoming.value && Date.parse(props.offer.expiresAt) - Date.now() < 3 * 864e5)
</script>

<template>
  <article
    class="relative flex overflow-hidden rounded-2xl bg-white shadow-card"
    :class="compact ? 'min-h-24' : 'min-h-32'"
    :style="{ boxShadow: theme ? `0 0 0 1.5px ${theme.primaryColor}33, 0 6px 18px -10px ${theme.primaryColor}88` : undefined }"
    :data-upcoming="upcoming || undefined"
  >
    <!-- Stub in the supermarket's colours -->
    <div class="relative flex shrink-0 flex-col items-center justify-center px-3 text-center" :class="compact ? 'w-24' : 'w-32'" :style="{ background: stub.bg, color: stub.fg }">
      <span class="pointer-events-none absolute inset-0 opacity-20" style="background: radial-gradient(circle at 20% 15%, #fff 0 18%, transparent 19%), radial-gradient(circle at 85% 90%, #fff 0 14%, transparent 15%)" aria-hidden="true" />
      <span class="relative leading-none font-black tracking-tight" :class="headline.length > 9 ? (compact ? 'text-base' : 'text-xl') : compact ? 'text-2xl' : 'text-3xl'">{{ headline }}</span>
      <span v-if="offer.code" class="relative mt-1.5 rounded border border-dashed px-1.5 py-0.5 text-[0.6rem] font-bold tracking-wider" :style="{ borderColor: theme ? theme.accentColor : stub.fg, color: theme ? theme.accentColor : stub.fg }">{{ offer.code }}</span>
      <span v-if="upcoming" class="absolute top-2.5 -left-7 w-28 -rotate-45 bg-hela-gold py-0.5 text-center text-[0.55rem] font-black tracking-widest text-hela-green-900 shadow" aria-hidden="true">SOON</span>
    </div>
    <!-- Perforation -->
    <div class="relative w-0 border-l-2 border-dashed border-line" aria-hidden="true">
      <span class="absolute -top-2 -left-2 size-4 rounded-full bg-warm-white ring-1 ring-black/5" />
      <span class="absolute -bottom-2 -left-2 size-4 rounded-full bg-warm-white ring-1 ring-black/5" />
    </div>
    <!-- Details -->
    <div class="flex min-w-0 flex-1 flex-col p-3" :class="compact ? '' : 'sm:p-4'">
      <div class="flex items-center justify-between gap-2">
        <div class="flex min-w-0 items-center gap-1.5">
          <StoreBadge v-if="badgeBranding" :name="offer.storeName ?? ''" :branding="badgeBranding" size="size-6" class="!rounded-md" />
          <p class="min-w-0 truncate text-[0.65rem] font-extrabold tracking-wide uppercase" :style="{ color: nameColor ?? '#6B7A72' }">{{ offer.storeName ?? 'HelaMart offer' }}</p>
        </div>
        <span v-if="applied" class="inline-flex shrink-0 items-center gap-1 rounded-full bg-hela-green px-2 py-0.5 text-[0.6rem] font-bold text-white"><AppIcon name="check" :size="10" />Applied</span>
        <span v-else-if="upcoming" class="shrink-0 rounded-full bg-hela-gold-100 px-2 py-0.5 text-[0.6rem] font-bold text-[#6d5622]">Coming soon</span>
        <span v-else-if="endingSoon" class="shrink-0 rounded-full bg-[#FBEAEA] px-2 py-0.5 text-[0.6rem] font-bold text-[#8A2E2E]">Ending soon</span>
      </div>
      <p class="mt-1 font-bold text-ink" :class="compact ? 'line-clamp-1 text-sm' : 'line-clamp-2'">{{ offer.title }}</p>
      <p class="truncate text-xs text-muted">{{ offerSubject(offer.rule) }}</p>
      <div v-if="chips.length" class="mt-1.5 flex flex-wrap gap-1">
        <span v-for="c in chips" :key="c" class="rounded-md px-1.5 py-0.5 text-[0.65rem] font-semibold text-ink" :style="{ background: theme ? `${theme.primaryColor}14` : '#F7F5EF' }">{{ c }}</span>
      </div>
      <p class="mt-auto pt-1.5 text-[0.7rem] font-semibold" :class="upcoming ? 'text-[#6d5622]' : endingSoon ? 'text-[#8A2E2E]' : 'text-muted'">{{ when }}</p>
    </div>
  </article>
</template>
