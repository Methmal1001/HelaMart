import * as THREE from 'three'

export interface Box2 {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  /** Height of the obstacle — used to block the follow camera. */
  height: number
}

const ray = new THREE.Ray()
const box3 = new THREE.Box3()
const hit = new THREE.Vector3()

/** Simple 2D obstacle world (floor-plan rectangles) for shopper movement. */
export class CollisionWorld {
  readonly boxes: Box2[] = []

  addRect(cx: number, cz: number, w: number, d: number, height = 3) {
    this.boxes.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, height })
  }

  /** Rotated fixtures are added by their world-space bounding rectangle. */
  addRotatedRect(cx: number, cz: number, length: number, depth: number, rotY: number, height = 3) {
    const c = Math.abs(Math.cos(rotY))
    const s = Math.abs(Math.sin(rotY))
    this.addRect(cx, cz, length * c + depth * s, length * s + depth * c, height)
  }

  /** Push a circle out of all obstacles. Returns the corrected position in `out`. */
  resolveCircle(x: number, z: number, r: number, out: { x: number; z: number }) {
    let px = x
    let pz = z
    for (let iter = 0; iter < 2; iter++) {
      for (const b of this.boxes) {
        const cx = Math.max(b.minX, Math.min(px, b.maxX))
        const cz = Math.max(b.minZ, Math.min(pz, b.maxZ))
        const dx = px - cx
        const dz = pz - cz
        const d2 = dx * dx + dz * dz
        if (d2 >= r * r) continue
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2)
          px = cx + (dx / d) * r
          pz = cz + (dz / d) * r
        } else {
          // Centre is inside the box: push out along the shortest axis.
          const left = px - b.minX
          const right = b.maxX - px
          const front = b.maxZ - pz
          const back = pz - b.minZ
          const m = Math.min(left, right, front, back)
          if (m === left) px = b.minX - r
          else if (m === right) px = b.maxX + r
          else if (m === front) pz = b.maxZ + r
          else pz = b.minZ - r
        }
      }
    }
    out.x = px
    out.z = pz
    return out
  }

  /**
   * Distance along a ray (from → to) before it hits an obstacle, used to pull
   * the third-person camera in front of shelves and walls.
   */
  clearDistance(from: THREE.Vector3, to: THREE.Vector3) {
    const dir = hit.copy(to).sub(from)
    const maxDist = dir.length()
    if (maxDist < 1e-4) return maxDist
    ray.set(from, dir.normalize())
    let best = maxDist
    const point = new THREE.Vector3()
    for (const b of this.boxes) {
      box3.min.set(b.minX, 0, b.minZ)
      box3.max.set(b.maxX, b.height, b.maxZ)
      if (ray.intersectBox(box3, point)) {
        const d = point.distanceTo(from)
        if (d < best) best = d
      }
    }
    return best
  }
}
