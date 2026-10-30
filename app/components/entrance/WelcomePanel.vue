<script setup lang="ts">
import { AVATAR_OPTIONS } from '~/composables/useAvatar'

const { avatar, select } = useAvatar()
const xp = useStoreExperience()
const { show } = useToasts()
const panel = ref<HTMLElement | null>(null)

const ready = computed(() => xp.phase.value === 'welcome')

function choose(kind: (typeof AVATAR_OPTIONS)[number]['kind']) {
  select(kind)
  show(`${kind === 'male' ? 'Male' : 'Female'} avatar selected`)
}

const { area, openFinder } = useShoppingArea()
const { choice, choiceServesArea } = useStoreSelection()

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

/** Keep the 3D composition centred in the space the panel leaves free. */
function updateOffset() {
  const el = panel.value
  if (!el) return
  const r = el.getBoundingClientRect()
  const w = window.innerWidth
  const h = window.innerHeight
  if (w >= 1024) xp.setWelcomeOffset((r.right + 8) / (2 * w), 0)
  else xp.setWelcomeOffset(0, Math.min(0.32, (h - r.top) / (2 * h)) * 0.9)
}

let observer: ResizeObserver | null = null
onMounted(() => {
  observer = new ResizeObserver(updateOffset)
  if (panel.value) observer.observe(panel.value)
  window.addEventListener('resize', updateOffset)
  updateOffset()
})
onBeforeUnmount(() => {
  observer?.disconnect()
  window.removeEventListener('resize', updateOffset)
})
watch(() => xp.phase.value, (p) => p === 'welcome' && nextTick(updateOffset))

const steps = ['Choose avatar', 'Enter store', 'Explore aisles', 'Checkout']
</script>

<template>
  <aside
    class="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex p-3 sm:p-4 lg:inset-y-0 lg:right-auto lg:left-0 lg:w-[31rem] lg:items-center lg:p-6 xl:left-6"
    aria-labelledby="welcome-title"
  >
    <div
      ref="panel"
      class="pointer-events-auto max-h-[calc(100dvh-1.5rem)] w-full overflow-y-auto rounded-3xl bg-warm-white/97 p-5 shadow-float ring-1 ring-black/5 sm:p-6 lg:p-8"
    >
      <BrandLogo tagline class="mb-8 hidden lg:flex" />

      <p class="eyebrow">Virtual supermarket · Sri Lanka</p>
      <h1 id="welcome-title" class="mt-2 text-2xl leading-[1.05] font-extrabold tracking-[-0.045em] text-hela-green sm:text-3xl lg:text-[2.6rem]">
        Step into your <span class="text-hela-gold-600">everyday</span> store.
      </h1>
      <p class="mt-3 hidden text-[0.95rem] leading-relaxed text-muted lg:block">
        Walk the aisles of HelaMart just like you would in person. Choose your shopper, take a cart and step through the doors.
      </p>

      <ol class="mt-5 hidden flex-wrap gap-2 lg:flex" aria-label="Your shopping journey">
        <li v-for="(s, i) in steps" :key="s" class="chip bg-white py-1.5 text-[#456052] ring-1 ring-line">
          <b class="grid size-5 place-items-center rounded-full bg-hela-green-50 text-[0.65rem] text-hela-green">{{ i + 1 }}</b>
          {{ s }}
        </li>
      </ol>

      <div class="mt-5">
        <StoreChooser />
      </div>

      <div v-if="xp.pendingLabel.value" class="mt-4 flex items-start gap-3 rounded-2xl bg-[#FFF4F0] p-3.5 ring-2 ring-[#E23B3B]" role="status" data-testid="pending-offer">
        <span class="grid size-9 shrink-0 place-items-center rounded-full bg-[#E23B3B] text-white"><AppIcon name="gift" :size="17" /></span>
        <div class="min-w-0 flex-1 text-sm">
          <p class="font-bold text-ink">Taking you to: {{ xp.pendingLabel.value }}</p>
          <p class="text-xs text-muted">{{ avatar ? 'Press Enter — we’ll walk you straight to it.' : 'Choose your avatar first, then enter — we’ll walk you straight to it.' }}</p>
        </div>
        <button type="button" class="shrink-0 rounded-lg p-1 text-muted hover:bg-white" aria-label="Cancel" @click="(xp.pendingLabel.value = null), (xp.pendingProductId.value = null)"><AppIcon name="close" :size="15" /></button>
      </div>

      <div class="mt-5 lg:mt-6">
        <h2 class="text-base font-bold text-ink">Who is shopping today?</h2>
        <p class="mt-1 text-xs leading-relaxed text-muted sm:text-[0.8rem]">
          Pick a character for your visit — it’s only a visual preference, not information about you.
        </p>
        <div class="mt-3 grid grid-cols-2 gap-3" role="group" aria-label="Choose an avatar">
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

      <button
        type="button"
        class="btn-primary mt-4 h-13 w-full text-[0.95rem]"
        :disabled="!avatar || !ready"
        @click="enter"
      >
        <AppIcon name="door" :size="19" />
        {{ !ready ? 'Preparing the store…' : !avatar ? 'Choose an avatar to enter' : blocker === 'area' ? 'Choose your area to enter' : blocker ? 'Pick a store that delivers here' : xp.pendingLabel.value ? 'Enter & go to the offer' : 'Enter HelaMart' }}
        <AppIcon v-if="avatar && ready" name="arrow-right" :size="18" />
      </button>

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
  </aside>
</template>
