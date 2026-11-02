<script setup lang="ts">
import type { ShopperLocation } from '~/types'
import type { PublicBanner } from '~/services/bannerService'

/**
 * HelaMart's promotion banners for the shopper's area (managed by head office).
 *  - floating: compact card over the 3D welcome scene (wide screens)
 *  - strip:    slim banner for phones
 *  - hero:     wide banner on the Browse page
 * Auto-rotates (paused on hover/focus or with reduced motion), swipeable.
 */
const props = withDefaults(defineProps<{ variant?: 'floating' | 'strip' | 'hero'; previewArea?: ShopperLocation | null; reloadKey?: number }>(), { variant: 'hero', previewArea: undefined, reloadKey: 0 })

const { area: shopperArea } = useShoppingArea()
/** The admin page can preview banners as seen from any area. */
const area = computed(() => (props.previewArea !== undefined ? props.previewArea : shopperArea.value))
const isPreview = computed(() => props.previewArea !== undefined)
const selection = useStoreSelection()
const { openPanel } = useStoreUi()
const { show } = useToasts()

const banners = ref<PublicBanner[]>([])
const index = ref(0)
const paused = ref(false)
const images = ref<Record<string, string>>({})
const seen = new Set<string>()
const root = ref<HTMLElement | null>(null)
let timer: ReturnType<typeof setInterval> | undefined

const current = computed(() => banners.value[index.value] ?? null)

async function load() {
  const { listHomeBanners } = await import('~/services/bannerService')
  const keep = current.value?.id
  banners.value = await listHomeBanners(area.value)
  index.value = Math.max(0, banners.value.findIndex((b) => b.id === keep))
  const { resolveImageUrl } = await import('~/services/mock/mediaStore')
  for (const b of banners.value) if (b.image && !images.value[b.id]) images.value[b.id] = (await resolveImageUrl(b.image)) ?? ''
}

function go(i: number) {
  if (!banners.value.length) return
  index.value = (i + banners.value.length) % banners.value.length
}
function start() {
  clearInterval(timer)
  if (banners.value.length < 2 || prefersReducedMotion()) return
  timer = setInterval(() => !paused.value && go(index.value + 1), 6500)
}

// Count each banner once per visit when it's actually shown.
watch(current, async (b) => {
  // Only count banners actually on screen (the phone layout keeps a hidden copy on wide screens).
  if (!b || seen.has(b.id) || !root.value?.offsetParent) return
  seen.add(b.id)
  if (isPreview.value) return
  const { recordBannerEvent } = await import('~/services/bannerService')
  recordBannerEvent(b.id, 'view')
})

async function act(b: PublicBanner) {
  if (isPreview.value) return
  const { recordBannerEvent } = await import('~/services/bannerService')
  recordBannerEvent(b.id, 'click')
  if (!b.store) return
  if (!b.store.branchId) {
    show(`${b.store.name} doesn’t deliver to your area yet.`, 'error')
    return
  }
  selection.select(b.store.id, b.store.branchId)
  show(`Shopping at ${b.store.name} · ${b.store.branchName}`, 'success')
  if (b.cta === 'offers') openPanel('offers')
}

// Swipe on touch screens.
let downX: number | null = null
function onDown(e: PointerEvent) {
  downX = e.clientX
}
function onUp(e: PointerEvent) {
  if (downX === null) return
  const dx = e.clientX - downX
  downX = null
  if (Math.abs(dx) > 40) go(index.value + (dx < 0 ? 1 : -1))
}

watch(() => [area.value ? `${area.value.lat},${area.value.lng},${area.value.district}` : '', props.reloadKey], load)
watch(banners, start)
// Scheduled banners appear (and expired ones go) on time without a reload.
let refreshTimer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  void load()
  refreshTimer = setInterval(() => !document.hidden && void load(), 120_000)
})
onBeforeUnmount(() => {
  clearInterval(timer)
  clearInterval(refreshTimer)
})
</script>

<template>
  <section
    v-if="current"
    ref="root"
    class="relative overflow-hidden text-left select-none"
    :class="{
      'w-[22rem] rounded-3xl shadow-float ring-1 ring-black/10': variant === 'floating',
      'rounded-2xl shadow-card ring-1 ring-black/10': variant === 'strip',
      'rounded-3xl shadow-card ring-1 ring-black/5': variant === 'hero',
    }"
    aria-roledescription="carousel"
    :aria-label="`HelaMart offers${area ? ` for ${area.label}` : ''}`"
    data-testid="home-banners"
    @mouseenter="paused = true"
    @mouseleave="paused = false"
    @focusin="paused = true"
    @focusout="paused = false"
    @pointerdown="onDown"
    @pointerup="onUp"
  >
    <Transition mode="out-in" enter-active-class="transition duration-500 ease-out" enter-from-class="opacity-0 translate-x-3" leave-active-class="transition duration-200" leave-to-class="opacity-0">
      <BannerSlide
        :key="current.id"
        :banner="current"
        :variant="variant"
        :image-url="images[current.id]"
        role="group"
        aria-roledescription="slide"
        :aria-label="`${index + 1} of ${banners.length}`"
        :data-testid="`banner-${current.id}`"
        @act="act"
      />
    </Transition>

    <!-- Controls -->
    <div v-if="banners.length > 1" class="absolute bottom-2.5 left-1/2 flex -translate-x-1/2 items-center gap-1.5" :class="variant === 'strip' ? 'bottom-1.5' : ''">
      <button
        v-for="(b, i) in banners"
        :key="b.id"
        type="button"
        class="h-1.5 rounded-full transition-all"
        :class="i === index ? 'w-5 bg-white' : 'w-1.5 bg-white/50 hover:bg-white/80'"
        :aria-label="`Show banner ${i + 1}: ${b.title}`"
        :aria-current="i === index"
        @click="go(i)"
      />
    </div>
    <template v-if="banners.length > 1 && variant === 'hero'">
      <button type="button" class="absolute top-1/2 left-1.5 hidden size-8 -translate-y-1/2 place-items-center rounded-full bg-black/20 text-white backdrop-blur hover:bg-black/35 sm:grid" aria-label="Previous banner" @click="go(index - 1)"><AppIcon name="arrow-left" :size="15" /></button>
      <button type="button" class="absolute top-1/2 right-1.5 hidden size-8 -translate-y-1/2 place-items-center rounded-full bg-black/20 text-white backdrop-blur hover:bg-black/35 sm:grid" aria-label="Next banner" @click="go(index + 1)"><AppIcon name="arrow-right" :size="15" /></button>
    </template>
  </section>
</template>
