import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

const unitBox = new THREE.BoxGeometry(1, 1, 1)
const tmpMatrix = new THREE.Matrix4()
const tmpQuat = new THREE.Quaternion()
const tmpPos = new THREE.Vector3()
const tmpScale = new THREE.Vector3()
const yAxis = new THREE.Vector3(0, 1, 0)

/**
 * Collects static geometry per material and merges it into one mesh each.
 * Hundreds of shelf boards, uprights and walls become a handful of draw calls.
 */
export class StaticBatch {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>()

  add(geometry: THREE.BufferGeometry, material: THREE.Material, matrix: THREE.Matrix4) {
    const g = geometry.clone()
    g.applyMatrix4(matrix)
    // Normalise attributes so geometries of different types can be merged.
    for (const name of Object.keys(g.attributes)) {
      if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name)
    }
    const g2 = g.index ? g.toNonIndexed() : g
    if (g2 !== g) g.dispose()
    let list = this.parts.get(material)
    if (!list) this.parts.set(material, (list = []))
    list.push(g2)
  }

  /** Axis-aligned (optionally Y-rotated) box in the given frame. */
  box(
    material: THREE.Material,
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    frame?: THREE.Matrix4,
    rotY = 0,
  ) {
    tmpQuat.setFromAxisAngle(yAxis, rotY)
    tmpMatrix.compose(tmpPos.set(x, y, z), tmpQuat, tmpScale.set(w, h, d))
    if (frame) tmpMatrix.premultiply(frame)
    this.add(unitBox, material, tmpMatrix)
  }

  build(parent: THREE.Object3D, { castShadow = true, receiveShadow = true } = {}) {
    const meshes: THREE.Mesh[] = []
    for (const [material, list] of this.parts) {
      const merged = mergeGeometries(list, false)
      list.forEach((g) => g.dispose())
      if (!merged) continue
      merged.computeBoundingSphere()
      const mesh = new THREE.Mesh(merged, material)
      mesh.castShadow = castShadow && !(material as THREE.MeshStandardMaterial).transparent
      mesh.receiveShadow = receiveShadow
      mesh.matrixAutoUpdate = false
      mesh.updateMatrix()
      parent.add(mesh)
      meshes.push(mesh)
    }
    this.parts.clear()
    return meshes
  }
}

/** Build a frame matrix: rotate around Y, then translate. */
export function frameMatrix(x: number, z: number, rotY: number, y = 0) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromAxisAngle(yAxis, rotY),
    new THREE.Vector3(1, 1, 1),
  )
}
