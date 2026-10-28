import type { AvatarKind, ExperiencePhase, PlayerSnapshot, QualityLevel } from '~/types'

export interface EngineCallbacks {
  onProgress?: (value: number, label: string) => void
  onPhase?: (phase: ExperiencePhase) => void
  onPlayer?: (snapshot: PlayerSnapshot) => void
  onProductPick?: (productId: string) => void
  onProductHover?: (hover: { productId: string; x: number; y: number } | null) => void
  onAvatarPick?: (kind: AvatarKind) => void
  onPointerLock?: (locked: boolean) => void
  onAvatarPortraits?: (portraits: Record<AvatarKind, string>) => void
  onWelcomeInside?: () => void
}

export interface EngineOptions {
  quality: QualityLevel
  reducedMotion: boolean
  /** Skip the entrance and spawn inside (e.g. returning from the cart page). */
  startInside: boolean
  avatar: AvatarKind | null
  /** Restore a previous position when re-entering the store view. */
  spawn?: { x: number; z: number; yaw: number } | null
}

export interface QualityPreset {
  pixelRatio: number
  antialias: boolean
  shadows: boolean
  shadowMapSize: number
  /** Rows of products behind the front facing on each shelf. */
  depthRows: number
}

export const QUALITY_PRESETS: Record<QualityLevel, QualityPreset> = {
  low: { pixelRatio: 1, antialias: false, shadows: false, shadowMapSize: 512, depthRows: 1 },
  balanced: { pixelRatio: 1.5, antialias: true, shadows: true, shadowMapSize: 1024, depthRows: 2 },
  high: { pixelRatio: 2, antialias: true, shadows: true, shadowMapSize: 2048, depthRows: 3 },
}
