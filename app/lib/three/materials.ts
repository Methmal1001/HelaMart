import * as THREE from 'three'

export const BRAND = {
  green: '#174D38',
  gold: '#E1C987',
  cream: '#F7F5EF',
  warmWhite: '#FBFAF6',
}

/**
 * Central material cache. Reusing materials keeps shader programs and draw-call
 * batching efficient, and gives one place to dispose everything.
 */
export class MaterialLibrary {
  private cache = new Map<string, THREE.Material>()

  get<T extends THREE.Material>(key: string, create: () => T): T {
    let m = this.cache.get(key)
    if (!m) {
      m = create()
      m.name = key
      this.cache.set(key, m)
    }
    return m as T
  }

  standard(key: string, params: THREE.MeshStandardMaterialParameters) {
    return this.get(key, () => new THREE.MeshStandardMaterial(params))
  }

  color(hex: string, roughness = 0.7, metalness = 0) {
    return this.standard(`c:${hex}:${roughness}:${metalness}`, { color: hex, roughness, metalness })
  }

  emissive(hex: string, intensity = 1) {
    return this.standard(`e:${hex}:${intensity}`, {
      color: hex,
      emissive: hex,
      emissiveIntensity: intensity,
      roughness: 0.4,
    })
  }

  glass(key = 'glass', opacity = 0.18, tint = '#cfe6e0') {
    return this.get(
      key,
      () =>
        new THREE.MeshStandardMaterial({
          color: tint,
          transparent: true,
          opacity,
          roughness: 0.05,
          metalness: 0.1,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
    )
  }

  dispose() {
    for (const m of this.cache.values()) {
      for (const value of Object.values(m)) {
        if (value instanceof THREE.Texture) value.dispose()
      }
      m.dispose()
    }
    this.cache.clear()
  }
}
