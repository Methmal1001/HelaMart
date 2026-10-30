<script setup lang="ts">
useHead({ title: 'HelaMart — Step into your virtual supermarket' })

const xp = useStoreExperience()
const ui = useStoreUi()

const phase = computed(() => xp.phase.value)
const showWelcome = computed(() => phase.value === 'welcome' || (phase.value === 'loading' && !xp.hasEntered.value))

// Close any overlay that belongs to the store when leaving it.
onBeforeUnmount(() => {
  if (ui.panel.value === 'browse' || ui.panel.value === 'settings' || ui.panel.value === 'help') ui.closePanel()
})
</script>

<template>
  <main class="fixed inset-0 overflow-hidden bg-[#dfe9df]">
    <h1 class="sr-only">HelaMart virtual supermarket</h1>
    <SupermarketCanvas />

    <Transition leave-active-class="pointer-events-none transition-opacity duration-500" leave-to-class="opacity-0" :duration="{ enter: 0, leave: 500 }">
      <LoadingScreen v-if="phase === 'loading'" />
    </Transition>

    <WebglFallback v-if="phase === 'unsupported' || phase === 'error'" :reason="phase === 'unsupported' ? 'unsupported' : 'error'" />

    <!-- Mobile brand while choosing an avatar. -->
    <Transition leave-active-class="pointer-events-none transition duration-500" leave-to-class="opacity-0 -translate-y-2">
      <div v-if="phase === 'welcome'" class="pointer-events-none absolute top-3 left-3 z-20 lg:hidden">
        <div class="hud-surface rounded-2xl py-2 pr-4 pl-2">
          <BrandLogo size="sm" tagline />
        </div>
      </div>
    </Transition>

    <!-- Account / login is available before entering too. -->
    <Transition leave-active-class="pointer-events-none transition duration-500" leave-to-class="opacity-0">
      <div v-if="phase === 'welcome'" class="absolute top-3 right-3 z-20 sm:top-4 sm:right-4">
        <AccountButton />
      </div>
    </Transition>

    <Transition
      enter-active-class="transition duration-500 ease-[cubic-bezier(.2,.8,.2,1)]"
      leave-active-class="pointer-events-none transition duration-500 ease-in"
      enter-from-class="opacity-0 translate-y-4 lg:translate-y-0 lg:-translate-x-6"
      leave-to-class="opacity-0 translate-y-6 lg:translate-y-0 lg:-translate-x-10"
    >
      <WelcomePanel v-if="showWelcome && phase !== 'loading'" />
    </Transition>

    <!-- HelaMart offers for the shopper's area (head-office banners), clear of the welcome panel. -->
    <Transition enter-active-class="transition duration-700 delay-300" enter-from-class="opacity-0 translate-y-4" leave-active-class="pointer-events-none transition duration-200" leave-to-class="opacity-0">
      <div v-if="phase === 'welcome'" class="absolute right-6 bottom-6 z-20 hidden lg:block">
        <HomeBanners variant="floating" />
      </div>
    </Transition>

    <Transition enter-active-class="transition duration-500" enter-from-class="opacity-0" leave-active-class="pointer-events-none transition duration-300" leave-to-class="opacity-0">
      <div v-if="phase === 'entering'" class="absolute inset-x-0 bottom-8 z-20 flex justify-center px-4" role="status">
        <span class="hud-surface flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-ink">
          <span class="size-2 animate-pulse rounded-full bg-hela-green" aria-hidden="true" />
          Doors opening — welcome inside!
        </span>
      </div>
    </Transition>

    <Transition enter-active-class="transition duration-700 delay-200" enter-from-class="opacity-0">
      <StoreHud v-if="phase === 'inside'" />
    </Transition>

    <SettingsPanel v-if="phase === 'inside'" />
  </main>
</template>
