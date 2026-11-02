<script setup lang="ts">
import type { PublicBanner } from '~/services/bannerService'

/** One HelaMart banner: themed background (or photo), headline, featured store, offer burst and button. */
const props = withDefaults(defineProps<{ banner: PublicBanner; variant?: 'floating' | 'strip' | 'hero'; imageUrl?: string | null }>(), { variant: 'hero', imageUrl: null })
const emit = defineEmits<{ act: [banner: PublicBanner] }>()

const THEMES: Record<PublicBanner['theme'], { bg: string; fg: string; accent: string; sub: string }> = {
  green: { bg: 'linear-gradient(120deg,#174D38 0%,#0E3426 100%)', fg: '#FFFFFF', accent: '#E1C987', sub: 'rgba(255,255,255,0.78)' },
  gold: { bg: 'linear-gradient(120deg,#F3E2B3 0%,#E1C987 55%,#CDAA5C 100%)', fg: '#174D38', accent: '#174D38', sub: 'rgba(23,77,56,0.8)' },
  sunset: { bg: 'linear-gradient(120deg,#F7A541 0%,#E8572B 60%,#C2361A 100%)', fg: '#FFFFFF', accent: '#FFF1B8', sub: 'rgba(255,255,255,0.85)' },
  ocean: { bg: 'linear-gradient(120deg,#2BA4B5 0%,#1F7F8C 55%,#145761 100%)', fg: '#FFFFFF', accent: '#E1F7FA', sub: 'rgba(255,255,255,0.82)' },
  berry: { bg: 'linear-gradient(120deg,#B4467A 0%,#9E3A5A 50%,#6B1F3A 100%)', fg: '#FFFFFF', accent: '#FFD9E6', sub: 'rgba(255,255,255,0.82)' },
}
const t = computed(() => THEMES[props.banner.theme])
const BURST = 'polygon(50% 0%,61% 12%,75% 5%,79% 20%,95% 21%,90% 36%,100% 50%,90% 64%,95% 79%,79% 80%,75% 95%,61% 88%,50% 100%,39% 88%,25% 95%,21% 80%,5% 79%,10% 64%,0% 50%,10% 36%,5% 21%,21% 20%,25% 5%,39% 12%)'
</script>

<template>
  <div
    class="relative flex overflow-hidden"
    :class="variant === 'hero' ? 'min-h-44 sm:min-h-52' : variant === 'floating' ? 'min-h-40' : 'min-h-24'"
    :style="{ background: t.bg, color: t.fg }"
  >
    <!-- Photo (optional), faded into the theme colour so the text stays readable -->
    <template v-if="imageUrl">
      <img :src="imageUrl" alt="" class="absolute inset-0 size-full object-cover">
      <span class="absolute inset-0" :style="{ background: `linear-gradient(90deg, ${banner.theme === 'gold' ? 'rgba(243,226,179,0.95)' : 'rgba(0,0,0,0.62)'} 0%, transparent 78%)` }" aria-hidden="true" />
    </template>
    <span v-else class="pointer-events-none absolute inset-0 opacity-25" style="background: radial-gradient(circle at 92% 18%, rgba(255,255,255,0.55) 0 14%, transparent 15%), radial-gradient(circle at 78% 110%, rgba(255,255,255,0.4) 0 22%, transparent 23%), radial-gradient(circle at 105% 70%, rgba(255,255,255,0.35) 0 12%, transparent 13%)" aria-hidden="true" />

    <div class="relative flex min-w-0 flex-1 flex-col justify-center" :class="variant === 'strip' ? 'py-3 pr-24 pl-4' : variant === 'floating' ? 'p-5 pr-28' : 'p-6 pr-36 sm:p-8 sm:pr-48'">
      <p class="flex items-center gap-1.5 text-[0.65rem] font-bold tracking-[0.14em] uppercase" :style="{ color: t.accent }">
        <AppIcon name="sparkle" :size="12" />{{ banner.store ? `${banner.store.name}${banner.store.branchName ? ` · ${banner.store.branchName}` : ''}` : 'HelaMart' }}
      </p>
      <p class="mt-1 leading-tight font-extrabold tracking-tight" :class="variant === 'hero' ? 'text-2xl sm:text-3xl' : variant === 'floating' ? 'text-xl' : 'text-base'">{{ banner.title }}</p>
      <p v-if="variant !== 'strip' && banner.subtitle" class="mt-1 line-clamp-2 text-sm" :style="{ color: t.sub }">{{ banner.subtitle }}</p>
      <div v-if="banner.cta !== 'none' && banner.store" class="mt-3">
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-full px-4 font-bold shadow-sm transition hover:brightness-95"
          :class="variant === 'strip' ? 'h-8 text-xs' : 'h-10 text-sm'"
          :style="{ background: t.fg, color: banner.theme === 'gold' ? '#FFFFFF' : '#174D38' }"
          :data-testid="`banner-cta-${banner.id}`"
          @click="emit('act', banner)"
        >
          {{ banner.cta === 'offers' ? 'See the offer' : `Shop at ${banner.store.name}` }}<AppIcon name="arrow-right" :size="15" />
        </button>
      </div>
    </div>

    <!-- Offer burst -->
    <div v-if="banner.offer" class="absolute top-1/2 grid -translate-y-1/2 place-items-center text-center" :class="variant === 'strip' ? 'right-3 size-20' : variant === 'floating' ? 'right-4 size-24' : 'right-6 size-28 sm:right-10 sm:size-36'">
      <span class="absolute inset-0 animate-[spin_24s_linear_infinite] motion-reduce:animate-none" :style="{ background: t.accent, clipPath: BURST }" aria-hidden="true" />
      <span class="relative px-2 leading-none font-black" :class="variant === 'hero' ? 'text-xl sm:text-2xl' : 'text-sm'" :style="{ color: banner.theme === 'gold' ? '#FFFFFF' : '#174D38' }">{{ offerHeadline(banner.offer.rule) }}</span>
    </div>
  </div>
</template>
