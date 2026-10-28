import type { QualityLevel } from '~/types'

export function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function isCoarsePointer(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
}

/** Pick a sensible default quality for the current device. */
export function suggestQuality(): QualityLevel {
  if (typeof navigator === 'undefined') return 'balanced'
  const cores = navigator.hardwareConcurrency || 4
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4
  const smallScreen = Math.min(window.screen.width, window.screen.height) < 600
  if (isCoarsePointer() && (smallScreen || memory <= 4)) return 'low'
  if (cores <= 4 || memory <= 4) return 'low'
  if (cores >= 8 && memory >= 8 && !isCoarsePointer()) return 'high'
  return 'balanced'
}
