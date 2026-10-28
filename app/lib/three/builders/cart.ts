import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { wireGridTexture } from '../textures'

let shared: { frame: THREE.BufferGeometry; wheels: THREE.BufferGeometry; handle: THREE.BufferGeometry; basket: THREE.BufferGeometry } | null = null
let sharedMaterials: { steel: THREE.Material; wheel: THREE.Material; handle: THREE.Material; wire: THREE.Material } | null = null

function tube(len: number, x: number, y: number, z: number, axis: 'x' | 'y' | 'z', r = 0.012) {
  const g = new THREE.CylinderGeometry(r, r, len, 6)
  if (axis === 'x') g.rotateZ(Math.PI / 2)
  if (axis === 'z') g.rotateX(Math.PI / 2)
  return g.translate(x, y, z).toNonIndexed()
}

/**
 * Shopping cart (handle at +z, basket toward -z). Geometry is shared so a row
 * of carts at the entrance costs almost nothing.
 */
export function createCart(): THREE.Group {
  if (!shared || !sharedMaterials) {
    const W = 0.52
    const L = 0.82
    const frameParts = [
      // Chassis rails and posts.
      tube(L, -W / 2 + 0.04, 0.16, 0, 'z'),
      tube(L, W / 2 - 0.04, 0.16, 0, 'z'),
      tube(0.75, -W / 2 + 0.03, 0.55, 0.36, 'y'),
      tube(0.75, W / 2 - 0.03, 0.55, 0.36, 'y'),
      tube(0.42, -W / 2 + 0.06, 0.32, -0.36, 'y'),
      tube(0.42, W / 2 - 0.06, 0.32, -0.36, 'y'),
      // Bottom tray.
      new THREE.BoxGeometry(W - 0.08, 0.015, L - 0.2).translate(0, 0.2, 0).toNonIndexed(),
    ]
    const wheelParts = [-1, 1].flatMap((sx) =>
      [-1, 1].map((sz) =>
        new THREE.CylinderGeometry(0.05, 0.05, 0.035, 12).rotateZ(Math.PI / 2).translate((sx * (W - 0.1)) / 2, 0.05, sz * 0.33).toNonIndexed(),
      ),
    )
    // Basket: open-top box, slightly tapered, made of wire-mesh planes.
    const basketParts: THREE.BufferGeometry[] = []
    const bottomY = 0.5
    const topY = 0.92
    const plane = (w: number, h: number, x: number, y: number, z: number, ry: number) =>
      basketParts.push(new THREE.PlaneGeometry(w, h).rotateY(ry).translate(x, y, z).toNonIndexed())
    plane(W, topY - bottomY, 0, (topY + bottomY) / 2, -L / 2, 0)
    plane(W, topY - bottomY, 0, (topY + bottomY) / 2, L / 2 - 0.08, 0)
    plane(L - 0.08, topY - bottomY, -W / 2, (topY + bottomY) / 2, -0.04, Math.PI / 2)
    plane(L - 0.08, topY - bottomY, W / 2, (topY + bottomY) / 2, -0.04, Math.PI / 2)
    basketParts.push(new THREE.PlaneGeometry(W, L - 0.08).rotateX(-Math.PI / 2).translate(0, bottomY, -0.04).toNonIndexed())
    // Basket rim.
    frameParts.push(tube(L - 0.08, -W / 2, topY, -0.04, 'z', 0.01), tube(L - 0.08, W / 2, topY, -0.04, 'z', 0.01))
    frameParts.push(tube(W, 0, topY, -L / 2, 'x', 0.01), tube(W, 0, topY, L / 2 - 0.08, 'x', 0.01))

    shared = {
      frame: mergeGeometries(frameParts)!,
      wheels: mergeGeometries(wheelParts)!,
      handle: new THREE.CylinderGeometry(0.022, 0.022, W + 0.04, 10).rotateZ(Math.PI / 2).translate(0, 0.98, 0.46),
      basket: mergeGeometries(basketParts)!,
    }
    frameParts.concat(wheelParts, basketParts).forEach((g) => g.dispose())

    const tex = wireGridTexture()
    sharedMaterials = {
      steel: new THREE.MeshStandardMaterial({ color: '#C7CDD0', roughness: 0.3, metalness: 0.8 }),
      wheel: new THREE.MeshStandardMaterial({ color: '#2B2F31', roughness: 0.8 }),
      handle: new THREE.MeshStandardMaterial({ color: '#174D38', roughness: 0.45 }),
      wire: new THREE.MeshStandardMaterial({
        color: '#C7CDD0',
        roughness: 0.3,
        metalness: 0.8,
        alphaMap: tex,
        alphaTest: 0.5,
        transparent: false,
        side: THREE.DoubleSide,
      }),
    }
    tex.repeat.set(3, 2)
  }

  const g = new THREE.Group()
  g.name = 'cart'
  const parts: [THREE.BufferGeometry, THREE.Material][] = [
    [shared.frame, sharedMaterials.steel],
    [shared.wheels, sharedMaterials.wheel],
    [shared.handle, sharedMaterials.handle],
    [shared.basket, sharedMaterials.wire],
  ]
  for (const [geo, mat] of parts) {
    const mesh = new THREE.Mesh(geo, mat)
    mesh.castShadow = true
    mesh.userData.shared = true
    g.add(mesh)
  }
  return g
}

/** Free the shared cart resources (called once when the engine is disposed). */
export function disposeCartResources() {
  if (shared) Object.values(shared).forEach((g) => g.dispose())
  if (sharedMaterials) {
    Object.values(sharedMaterials).forEach((m) => {
      ;(m as THREE.MeshStandardMaterial).alphaMap?.dispose()
      m.dispose()
    })
  }
  shared = null
  sharedMaterials = null
}
