<script setup lang="ts">
import { AVATAR_OPTIONS } from '~/composables/useAvatar'

const { avatar, select } = useAvatar()
const xp = useStoreExperience()
const { show } = useToasts()
const panel = ref<HTMLElement | null>(null)
const body = ref<HTMLElement | null>(null)

const ready = computed(() => xp.phase.value === 'welcome')

function choose(kind: (typeof AVATAR_OPTIONS)[number]['kind']) {
  select(kind)
  show(`${kind === 'male' ? 'Male' : 'Female'} avatar selected`)
}

const { area, openFinder } = useShoppingArea()
const { choice, currentStore, choiceServesArea, refresh } = useStoreSelection()

/** Before entering: the shopper's area must be known and the chosen supermarket must deliver there. */
const blocker = computed<null | 'area' | 'coverage' | 'store'>(() => {
  if (!area.value) return 'area'
  if (!choice.value) return 'store'
  return choiceServesArea.value ? null : 'coverage'
})

function enter() {
  if (!avatar.value || !ready.value) return
  if (blocker.value === 'area') return openFinder('Choose your area first — we’ll check which supermarkets deliver to you.')
  if (blocker.value) {
    show(`${choice.value?.storeName ?? 'This supermarket'} doesn’t deliver to ${area.value!.label}. Choose one that does.`, 'error')
    return openFinder(`${choice.value?.storeName ?? 'Your supermarket'} doesn’t deliver to ${area.value!.label} — pick one that does.`)
  }
  xp.enter()
}
const enterLabel = computed(() =>
  !ready.value ? 'Preparing the store…'
  : !avatar.value ? 'Choose an avatar to enter'
  : blocker.value === 'area' ? 'Choose your area to enter'
  : blocker.value ? 'Pick a store that delivers here'
  : xp.pendingLabel.value ? 'Enter & go to the offer'
  : 'Enter HelaMart',
)

// ---- Panel size: mini (just the Enter bar) · compact (store, avatar, Enter) · full (everything)
type Size = 'mini' | 'compact' | 'full'
const SIZE_KEY = 'helamart:welcome-size:v1'
const isSize = (v: unknown): v is Size => v === 'mini' || v === 'compact' || v === 'full'
const size = ref<Size>('full')
const desktop = ref(false)
/** Desktop has no "mini": the panel sits beside the store, not over it. */
const sizes = computed<Size[]>(() => (desktop.value ? ['compact', 'full'] : ['mini', 'compact', 'full']))

function setSize(s: Size) {
  if (!sizes.value.includes(s)) s = 'compact'
  size.value = s
  writeStorage(SIZE_KEY, s)
}
function step(dir: 1 | -1) {
  const list = sizes.value
  const i = list.indexOf(size.value)
  setSize(list[Math.max(0, Math.min(list.length - 1, i + dir))]!)
}

/** Drag the handle up/down on phones (a tap expands, or shrinks a full panel). */
let dragY: number | null = null
function onHandleDown(e: PointerEvent) {
  dragY = e.clientY
  ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
}
function onHandleUp(e: PointerEvent) {
  if (dragY === null) return
  const dy = e.clientY - dragY
  dragY = null
  if (dy < -24) step(1)
  else if (dy > 24) step(-1)
  else setSize(size.value === 'full' ? 'compact' : size.value === 'mini' ? 'compact' : 'full')
}

// ---- Smooth height between sizes: animate the body to its content's height.
const bodyHeight = ref<number | null>(null)
let bodyObserver: ResizeObserver | null = null
function measure() {
  const inner = body.value?.firstElementChild as HTMLElement | null
  if (inner) bodyHeight.value = inner.offsetHeight
}
/** The body's content is re-created for each size: watch the current one. */
function observeBody() {
  bodyObserver?.disconnect()
  const inner = body.value?.firstElementChild
  if (inner) bodyObserver?.observe(inner)
  measure()
}

/** Keep the 3D composition centred in the space the panel leaves free. */
function updateOffset() {
  const el = panel.value
  if (!el) return
  const r = el.getBoundingClientRect()
  const w = window.innerWidth
  const h = window.innerHeight
  if (w >= 1024) xp.setWelcomeOffset(size.value === 'full' ? (r.right + 8) / (2 * w) : 0, 0)
  else xp.setWelcomeOffset(0, Math.min(0.32, (h - r.top) / (2 * h)) * 0.9)
}
function onResize() {
  const d = window.innerWidth >= 1024
  if (d !== desktop.value) {
    desktop.value = d
    if (!sizes.value.includes(size.value)) size.value = 'compact'
  }
  updateOffset()
}

let observer: ResizeObserver | null = null
onMounted(() => {
  desktop.value = window.innerWidth >= 1024
  // Phones open small so the store is visible; desktop opens full. A size the shopper picked is remembered.
  const saved = readStorage(SIZE_KEY, isSize)
  size.value = saved && sizes.value.includes(saved) ? saved : desktop.value ? 'full' : 'compact'
  void refresh()
  observer = new ResizeObserver(updateOffset)
  if (panel.value) observer.observe(panel.value)
  bodyObserver = new ResizeObserver(measure)
  window.addEventListener('resize', onResize)
  nextTick(() => {
    observeBody()
    updateOffset()
  })
})
onBeforeUnmount(() => {
  observer?.disconnect()
  bodyObserver?.disconnect()
  window.removeEventListener('resize', onResize)
})
watch(() => xp.phase.value, (p) => p === 'welcome' && nextTick(updateOffset))
watch(size, () => nextTick(() => {
  observeBody()
  updateOffset()
}))

const steps = ['Choose avatar', 'Enter store', 'Explore aisles', 'Checkout']
</script>

<template>
  <aside
    class="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex p-2.5 sm:p-4 lg:inset-y-0 lg:right-auto lg:left-0 lg:w-[27rem] lg:p-5 xl:left-4"
    :class="size === 'full' ? 'lg:items-center' : 'lg:items-end'"
    aria-labelledby="welcome-title"
    :data-size="size"
    data-testid="welcome-panel"
  >
    <div
      ref="panel"
      class="pointer-events-auto flex w-full flex-col overflow-hidden rounded-3xl bg-warm-white/95 shadow-float ring-1 ring-black/5 backdrop-blur-md"
    >
      <!-- Handle (phones) / size controls -->
      <div class="relative flex shrink-0 items-center justify-center px-4 pt-2 lg:justify-end lg:px-3 lg:pt-3">
        <button
          type="button"
          class="flex h-6 w-24 touch-none items-center justify-center lg:hidden"
          :aria-label="size === 'full' ? 'Make the panel smaller' : 'Show more options'"
          :aria-expanded="size === 'full'"
          data-testid="welcome-handle"
          @pointerdown="onHandleDown"
          @pointerup="onHandleUp"
          @pointercancel="dragY = null"
        >
          <span class="h-1.5 w-11 rounded-full bg-[#c9d4cb] transition-colors hover:bg-hela-green/50" />
        </button>
        <div class="absolute top-1.5 right-2 flex gap-1 lg:static">
          <button
            v-if="size !== sizes[0]"
            type="button"
            class="grid size-8 place-items-center rounded-full text-muted transition hover:bg-hela-green-50 hover:text-hela-green"
            aria-label="Minimise"
            title="Minimise"
            data-testid="welcome-smaller"
            @click="step(-1)"
          >
            <AppIcon name="minus" :size="16" />
          </button>
          <button
            v-if="size !== 'full'"
            type="button"
            class="grid size-8 place-items-center rounded-full text-muted transition hover:bg-hela-green-50 hover:text-hela-green"
            aria-label="Show more"
            title="Show more"
            data-testid="welcome-larger"
            @click="step(1)"
          >
            <AppIcon name="plus" :size="16" />
          </button>
        </div>
      </div>

      <div
        ref="body"
        class="overflow-hidden transition-[height] duration-300 ease-[cubic-bezier(.2,.8,.2,1)] motion-reduce:transition-none"
        :style="bodyHeight !== null ? { height: `${bodyHeight}px` } : undefined"
      >
        <div
          :key="size"
          class="welcome-body overflow-y-auto overscroll-contain px-4 pb-4 sm:px-5 lg:px-6 lg:pb-6"
          :class="size === 'full' ? 'max-h-[calc(100dvh-7.5rem)] lg:max-h-[calc(100dvh-5rem)]' : ''"
        >
          <!-- ============ MINI: one tap to enter ============ -->
          <div v-if="size === 'mini'" class="flex items-center gap-2">
            <button
              v-for="o in AVATAR_OPTIONS"
              :key="o.kind"
              type="button"
              class="grid size-11 shrink-0 place-items-center overflow-hidden rounded-full bg-hela-green-50 ring-2 transition"
              :class="avatar === o.kind ? 'ring-hela-green' : 'ring-transparent opacity-70'"
              :aria-pressed="avatar === o.kind"
              :aria-label="o.label"
              @click="choose(o.kind)"
            >
              <img v-if="xp.portraits.value[o.kind]" :src="xp.portraits.value[o.kind]" alt="" class="h-full w-auto object-contain object-top">
              <AppIcon v-else name="user" :size="18" class="text-hela-green/50" />
            </button>
            <button type="button" class="btn-primary h-11 min-w-0 flex-1 px-3 text-sm" :disabled="!avatar || !ready" data-testid="welcome-enter" @click="enter">
              <AppIcon name="door" :size="17" /><span class="truncate">{{ enterLabel }}</span>
            </button>
          </div>

          <!-- ============ COMPACT: store, avatar, enter ============ -->
          <div v-else-if="size === 'compact'">
            <BrandLogo size="sm" tagline class="mb-3 hidden lg:flex" />
            <p id="welcome-title" class="text-[0.7rem] font-bold tracking-[0.14em] text-hela-gold-600 uppercase">Step into your everyday store</p>

            <!-- Your supermarket -->
            <button
              v-if="area && currentStore && choice"
              type="button"
              class="mt-2 flex w-full items-center gap-3 rounded-2xl bg-white p-2.5 text-left ring-1 ring-line transition hover:ring-hela-green"
              data-testid="compact-store"
              @click="setSize('full')"
            >
              <StoreBadge :name="currentStore.name" :branding="currentStore.branding" :color="currentStore.brandColor" size="size-10" />
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm font-bold text-ink">{{ choice.storeName }}</span>
                <span class="flex items-center gap-1 truncate text-xs text-muted"><AppIcon name="pin" :size="11" />{{ choice.branchName }} · delivers to {{ area.label }}</span>
              </span>
              <span class="shrink-0 rounded-full bg-hela-green-50 px-2.5 py-1 text-xs font-bold text-hela-green">Change</span>
            </button>
            <button
              v-else
              type="button"
              class="mt-2 flex w-full items-center gap-3 rounded-2xl bg-gradient-to-r from-hela-green to-[#0E3426] p-3 text-left text-white transition hover:brightness-110"
              data-testid="compact-find"
              @click="area ? setSize('full') : openFinder()"
            >
              <span class="grid size-10 shrink-0 place-items-center rounded-xl bg-hela-gold text-hela-green-900"><AppIcon name="map" :size="18" /></span>
              <span class="min-w-0 flex-1">
                <span class="block text-sm font-bold">{{ area ? 'Choose your supermarket' : 'Find supermarkets near you' }}</span>
                <span class="block truncate text-xs text-white/75">{{ area ? `Delivering to ${area.label}` : 'Search your town or use your location' }}</span>
              </span>
              <AppIcon name="arrow-right" :size="16" />
            </button>

            <p v-if="xp.pendingLabel.value" class="mt-2 flex items-center gap-1.5 truncate rounded-xl bg-[#FFF4F0] px-2.5 py-1.5 text-xs font-bold text-[#B3162B]" data-testid="pending-offer">
              <AppIcon name="gift" :size="13" />Taking you to: {{ xp.pendingLabel.value }}
            </p>

            <!-- Avatar + enter -->
            <div class="mt-3 flex items-center gap-2">
              <div class="flex shrink-0 gap-1.5" role="group" aria-label="Choose an avatar">
                <button
                  v-for="o in AVATAR_OPTIONS"
                  :key="o.kind"
                  type="button"
                  class="relative grid size-13 place-items-center overflow-hidden rounded-2xl bg-hela-green-50 ring-2 transition"
                  :class="avatar === o.kind ? 'ring-hela-green bg-[radial-gradient(circle_at_50%_70%,#f6eed6,#eef4ef_70%)]' : 'ring-transparent hover:ring-line'"
                  :aria-pressed="avatar === o.kind"
                  :aria-label="o.label"
                  :data-testid="`compact-avatar-${o.kind}`"
                  @click="choose(o.kind)"
                >
                  <img v-if="xp.portraits.value[o.kind]" :src="xp.portraits.value[o.kind]" alt="" class="h-full w-auto object-contain">
                  <AppIcon v-else name="user" :size="20" class="text-hela-green/50" />
                  <span v-if="avatar === o.kind" class="absolute right-0.5 bottom-0.5 grid size-4 place-items-center rounded-full bg-hela-green text-hela-gold"><AppIcon name="check" :size="10" :stroke-width="3" /></span>
                </button>
              </div>
              <button type="button" class="btn-primary h-13 min-w-0 flex-1 px-3 text-sm" :disabled="!avatar || !ready" data-testid="welcome-enter" @click="enter">
                <AppIcon name="door" :size="18" /><span class="truncate">{{ enterLabel }}</span>
              </button>
            </div>
            <p v-if="avatar && ready && blocker === 'coverage'" class="mt-2 text-xs font-semibold text-[#8A2E2E]" role="alert" data-testid="enter-blocked">
              {{ choice?.storeName }} doesn’t deliver to {{ area?.label }}. Tap it to choose another.
            </p>
            <div class="mt-2.5 flex items-center justify-between text-xs">
              <button type="button" class="font-semibold text-hela-green hover:underline" data-testid="welcome-more" @click="setSize('full')">More options</button>
              <NuxtLink to="/browse" class="font-semibold text-muted underline-offset-4 hover:text-hela-green hover:underline">Shop without 3D</NuxtLink>
            </div>
          </div>

          <!-- ============ FULL ============ -->
          <div v-else>
            <BrandLogo tagline class="mb-5 hidden lg:flex" />

            <p class="eyebrow">Virtual supermarket · Sri Lanka</p>
            <h1 id="welcome-title" class="mt-1.5 text-2xl leading-[1.05] font-extrabold tracking-[-0.045em] text-hela-green lg:text-[2.1rem]">
              Step into your <span class="text-hela-gold-600">everyday</span> store.
            </h1>
            <p class="mt-2 hidden text-sm leading-relaxed text-muted lg:block">
              Walk the aisles of HelaMart just like you would in person. Choose your shopper, take a cart and step through the doors.
            </p>

            <ol class="mt-3 hidden flex-wrap gap-1.5 lg:flex" aria-label="Your shopping journey">
              <li v-for="(s, i) in steps" :key="s" class="chip bg-white py-1 text-xs text-[#456052] ring-1 ring-line">
                <b class="grid size-4.5 place-items-center rounded-full bg-hela-green-50 text-[0.6rem] text-hela-green">{{ i + 1 }}</b>
                {{ s }}
              </li>
            </ol>

            <div class="mt-4">
              <StoreChooser />
            </div>

            <div v-if="xp.pendingLabel.value" class="mt-3 flex items-start gap-3 rounded-2xl bg-[#FFF4F0] p-3 ring-2 ring-[#E23B3B]" role="status" data-testid="pending-offer">
              <span class="grid size-8 shrink-0 place-items-center rounded-full bg-[#E23B3B] text-white"><AppIcon name="gift" :size="15" /></span>
              <div class="min-w-0 flex-1 text-sm">
                <p class="font-bold text-ink">Taking you to: {{ xp.pendingLabel.value }}</p>
                <p class="text-xs text-muted">{{ avatar ? 'Press Enter — we’ll walk you straight to it.' : 'Choose your avatar first, then enter — we’ll walk you straight to it.' }}</p>
              </div>
              <button type="button" class="shrink-0 rounded-lg p-1 text-muted hover:bg-white" aria-label="Cancel" @click="(xp.pendingLabel.value = null), (xp.pendingProductId.value = null)"><AppIcon name="close" :size="15" /></button>
            </div>

            <div class="mt-4">
              <h2 class="text-base font-bold text-ink">Who is shopping today?</h2>
              <p class="mt-0.5 text-xs leading-relaxed text-muted">
                Pick a character for your visit — it’s only a visual preference, not information about you.
              </p>
              <div class="mt-2.5 grid grid-cols-2 gap-2.5" role="group" aria-label="Choose an avatar">
                <AvatarCard
                  v-for="o in AVATAR_OPTIONS"
                  :key="o.kind"
                  :kind="o.kind"
                  :label="o.label"
                  :description="o.description"
                  :selected="avatar === o.kind"
                  :portrait="xp.portraits.value[o.kind]"
                  @select="choose(o.kind)"
                />
              </div>
            </div>

            <!-- Enter stays in reach while scrolling the full panel -->
            <div class="sticky -bottom-4 z-10 -mx-4 mt-3 bg-gradient-to-t from-warm-white via-warm-white to-warm-white/0 px-4 pt-3 pb-1 sm:-mx-5 sm:px-5 lg:-bottom-6 lg:-mx-6 lg:px-6">
              <button type="button" class="btn-primary h-12 w-full text-[0.95rem]" :disabled="!avatar || !ready" data-testid="welcome-enter" @click="enter">
                <AppIcon name="door" :size="19" />
                {{ enterLabel }}
                <AppIcon v-if="avatar && ready" name="arrow-right" :size="18" />
              </button>
            </div>

            <p v-if="avatar && ready && blocker === 'coverage'" class="mt-2 flex items-start gap-1.5 text-xs font-semibold text-[#8A2E2E]" role="alert" data-testid="enter-blocked">
              <AppIcon name="alert" :size="14" class="mt-px shrink-0" />{{ choice?.storeName }} doesn’t deliver to {{ area?.label }}. Choose another supermarket or change your area.
            </p>
            <div class="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-muted">
              <span>No sign-up needed. You can change avatar anytime.</span>
              <NuxtLink to="/browse" class="font-semibold text-hela-green underline-offset-4 hover:underline">Shop without 3D</NuxtLink>
            </div>
            <div class="mt-3 lg:hidden"><HomeBanners variant="strip" /></div>
            <p class="mt-3 border-t border-line pt-3 text-xs text-muted">
              Own a supermarket in Sri Lanka?
              <NuxtLink to="/partner" class="font-semibold text-hela-green underline-offset-4 hover:underline">Join HelaMart →</NuxtLink>
            </p>
          </div>
        </div>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.welcome-body {
  animation: welcome-in 260ms cubic-bezier(0.2, 0.8, 0.2, 1);
  scrollbar-width: thin;
}
@keyframes welcome-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
}
@media (prefers-reduced-motion: reduce) {
  .welcome-body {
    animation: none;
  }
}
</style>
