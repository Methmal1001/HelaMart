import type { AvatarKind, ExperiencePhase, PlayerSnapshot, QualityLevel } from '~/types'
import type { StoreEngine } from '~/lib/three/StoreEngine'
import { getSection } from '~/data/storeLayout'

// The live engine instance (client-only; never serialised into state).
let engine: StoreEngine | null = null

export function isQualityLevel(v: unknown): v is QualityLevel {
  return v === 'low' || v === 'balanced' || v === 'high'
}

/**
 * Bridge between the Vue UI and the Three.js engine: shared reactive state
 * (phase, position, hover…) plus commands that forward to the engine.
 */
export function useStoreExperience() {
  const phase = useState<ExperiencePhase>('xp-phase', () => 'loading')
  const progress = useState('xp-progress', () => ({ value: 0, label: 'Preparing the store' }))
  const player = useState<PlayerSnapshot | null>('xp-player', () => null)
  /** Set once the shopper has walked in; returning to `/` then skips the entrance. */
  const hasEntered = useState<boolean>('xp-has-entered', () => false)
  const quality = useState<QualityLevel>('xp-quality', () => 'balanced')
  const pointerLocked = useState<boolean>('xp-pointer-locked', () => false)
  const hover = useState<{ productId: string; x: number; y: number } | null>('xp-hover', () => null)
  const portraits = useState<Partial<Record<AvatarKind, string>>>('xp-portraits', () => ({}))
  const viewMode = useState<'third' | 'first'>('xp-view', () => 'third')
  const fading = useState<boolean>('xp-fading', () => false)
  const welcomeBanner = useState<boolean>('xp-welcome-banner', () => false)
  /** A product to locate once the store is ready (e.g. from the catalogue page). */
  const pendingProductId = useState<string | null>('xp-pending-product', () => null)
  /** Why we're heading there, e.g. "20% off all drinks · Beverages aisle" (offers). */
  const pendingLabel = useState<string | null>('xp-pending-label', () => null)

  const currentSection = computed(() => (player.value?.sectionId ? getSection(player.value.sectionId) ?? null : null))

  function attach(e: StoreEngine) {
    engine = e
  }

  function detach() {
    engine = null
  }

  async function travel(action: (e: StoreEngine) => void) {
    if (!engine || phase.value !== 'inside') return
    const reduced = prefersReducedMotion()
    fading.value = true
    await new Promise((r) => setTimeout(r, reduced ? 0 : 230))
    if (engine) action(engine)
    await new Promise((r) => requestAnimationFrame(() => r(null)))
    fading.value = false
  }

  return {
    phase,
    progress,
    player,
    hasEntered,
    quality,
    pointerLocked,
    hover,
    portraits,
    viewMode,
    fading,
    welcomeBanner,
    pendingProductId,
    pendingLabel,
    currentSection,
    attach,
    detach,
    engine: () => engine,
    enter: () => engine?.enter(),
    selectAvatar: (kind: AvatarKind) => engine?.selectAvatar(kind),
    goToSection: (id: string) => travel((e) => e.goToSection(id)),
    goToProduct: (id: string) => travel((e) => e.goToProduct(id)),
    setMoveInput: (x: number, y: number) => engine?.setMoveInput(x, y),
    setInputEnabled: (enabled: boolean) => engine?.setInputEnabled(enabled),
    requestPointerLock: () => engine?.requestPointerLock(),
    exitPointerLock: () => engine?.exitPointerLock(),
    toggleView: () => {
      engine?.toggleView()
      if (engine) viewMode.value = engine.view
    },
    setQuality: (q: QualityLevel) => {
      quality.value = q
      engine?.setQuality(q)
    },
    setWelcomeOffset: (x: number, y: number) => engine?.setWelcomeOffset(x, y),
    returnToEntrance: () => {
      engine?.returnToEntrance()
      hasEntered.value = false
      player.value = null
      viewMode.value = 'third'
    },
  }
}
