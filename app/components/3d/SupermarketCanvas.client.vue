<script setup lang="ts">
import type { StoreEngine } from '~/lib/three/StoreEngine'
import { isQualityLevel } from '~/composables/useStoreExperience'

/**
 * Client-only host for the Three.js store. The engine (and Three.js itself)
 * is loaded as a separate chunk, so the welcome UI paints before WebGL work.
 */
const container = ref<HTMLElement | null>(null)
const xp = useStoreExperience()
const { avatar, select } = useAvatar()
const ui = useStoreUi()
let engine: StoreEngine | null = null
let cancelled = false

onMounted(async () => {
  if (!hasWebGL()) {
    xp.phase.value = 'unsupported'
    return
  }
  xp.phase.value = 'loading'
  xp.progress.value = { value: 0.02, label: 'Preparing the store' }
  const storedQuality = readStorage(STORAGE_KEYS.quality, isQualityLevel)
  xp.quality.value = storedQuality ?? suggestQuality()

  try {
    const { StoreEngine } = await import('~/lib/three/StoreEngine')
    if (cancelled || !container.value) return
    const startInside = xp.hasEntered.value
    engine = new StoreEngine(
      container.value,
      {
        onProgress: (value, label) => (xp.progress.value = { value, label }),
        onPhase: (phase) => {
          xp.phase.value = phase
          if (phase === 'inside') xp.hasEntered.value = true
        },
        onPlayer: (p) => (xp.player.value = p),
        onProductPick: (id) => ui.openProduct(id),
        onProductHover: (h) => (xp.hover.value = h),
        onAvatarPick: (kind) => select(kind),
        onPointerLock: (locked) => (xp.pointerLocked.value = locked),
        onAvatarPortraits: (p) => (xp.portraits.value = p),
        onWelcomeInside: () => (xp.welcomeBanner.value = true),
      },
      {
        quality: xp.quality.value,
        reducedMotion: prefersReducedMotion(),
        startInside,
        avatar: avatar.value,
        spawn: startInside && xp.player.value ? xp.player.value : null,
      },
    )
    xp.attach(engine)
    xp.viewMode.value = 'third'
    await engine.init()
  } catch (err) {
    console.error('[HelaMart] 3D store failed to start', err)
    xp.phase.value = 'error'
  }
})

onBeforeUnmount(() => {
  cancelled = true
  engine?.dispose()
  engine = null
  xp.detach()
  xp.hover.value = null
  xp.pointerLocked.value = false
  xp.phase.value = 'loading'
})

watch(avatar, (kind) => kind && engine?.selectAvatar(kind))
watch(ui.overlayOpen, (open) => engine?.setInputEnabled(!open))

// Locate a product requested from elsewhere (e.g. the catalogue page).
watch(
  () => [xp.phase.value, xp.pendingProductId.value] as const,
  ([phase, pending]) => {
    if (phase !== 'inside' || !pending) return
    xp.pendingProductId.value = null
    setTimeout(() => xp.goToProduct(pending), 350)
  },
  { immediate: true },
)
</script>

<template>
  <div ref="container" class="absolute inset-0 overflow-hidden outline-none" />
</template>
