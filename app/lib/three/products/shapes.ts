import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { ProductShape } from '~/types'

/**
 * Unit-sized procedural package geometries (fit inside a 1×1×1 box, base on
 * y = 0, front facing +z). Each instance is scaled to the product's real size.
 *
 * These are placeholders: when a product gets a real `model`, swap the
 * geometry for that product's loaded GLTF mesh in ProductInstancer.
 */
export interface ShapeGeometry {
  body: THREE.BufferGeometry
  label?: THREE.BufferGeometry
}

function strip(g: THREE.BufferGeometry) {
  for (const name of Object.keys(g.attributes)) {
    if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name)
  }
  return g.index ? g.toNonIndexed() : g
}

function merge(parts: THREE.BufferGeometry[]) {
  const merged = mergeGeometries(parts.map(strip), false)
  parts.forEach((p) => p.dispose())
  if (!merged) throw new Error('Failed to merge product geometry')
  merged.computeVertexNormals()
  return merged
}

function box(w = 1, h = 1, d = 1, y = 0.5) {
  return new THREE.BoxGeometry(w, h, d).translate(0, y, 0)
}

function cyl(rTop: number, rBottom: number, h: number, y: number, segments = 10, open = false) {
  return new THREE.CylinderGeometry(rTop, rBottom, h, segments, 1, open).translate(0, y, 0)
}

function bottle() {
  const pts = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(0.48, 0),
    new THREE.Vector2(0.5, 0.6),
    new THREE.Vector2(0.42, 0.72),
    new THREE.Vector2(0.2, 0.84),
    new THREE.Vector2(0.21, 0.93),
    new THREE.Vector2(0.21, 1),
    new THREE.Vector2(0, 1),
  ]
  return new THREE.LatheGeometry(pts, 8)
}

function bag() {
  const g = new THREE.BoxGeometry(1, 1, 1, 2, 4, 1)
  const pos = g.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i)
    // Pillow-like bulge, pinched at the top seal.
    const t = 1 - Math.pow(Math.abs(y) * 2, 2)
    pos.setZ(i, pos.getZ(i) * (0.55 + 0.45 * t))
    pos.setX(i, pos.getX(i) * (0.94 + 0.06 * t))
  }
  g.translate(0, 0.5, 0)
  return g
}

function loaf() {
  const top = new THREE.CylinderGeometry(0.5, 0.5, 1, 6, 1, false, 0, Math.PI)
    .rotateZ(Math.PI / 2)
    .scale(1, 0.7, 1)
    .translate(0, 0.62, 0)
  return merge([box(1, 0.62, 1, 0.31), top])
}

function carton() {
  return merge([box(1, 0.82, 1, 0.41), box(0.7, 0.18, 0.18, 0.91)])
}

function jar() {
  return merge([cyl(0.5, 0.5, 0.84, 0.42), cyl(0.53, 0.53, 0.16, 0.92)])
}

function long() {
  // Lies along x, like a banana/carrot/leek.
  return new THREE.CapsuleGeometry(0.5, 1, 2, 6).rotateZ(Math.PI / 2).scale(0.5, 1, 1).translate(0, 0.5, 0)
}

export function createShapeGeometries(): Record<ProductShape, ShapeGeometry> {
  const boxLabel = box(1.015, 0.42, 1.015, 0.5)
  return {
    box: { body: box(), label: boxLabel },
    tallBox: { body: box(), label: box(1.02, 0.3, 1.02, 0.62) },
    bottle: { body: bottle(), label: cyl(0.505, 0.505, 0.3, 0.33, 8, true) },
    can: { body: cyl(0.5, 0.5, 1, 0.5, 8), label: cyl(0.505, 0.505, 0.62, 0.5, 8, true) },
    jar: { body: jar(), label: cyl(0.505, 0.505, 0.4, 0.42, 10, true) },
    bag: { body: bag(), label: box(0.7, 0.32, 1.02, 0.46) },
    carton: { body: carton(), label: box(1.015, 0.36, 1.015, 0.42) },
    tray: { body: box(1, 0.7, 1, 0.35), label: box(0.92, 0.32, 0.92, 0.72) },
    loaf: { body: loaf(), label: box(0.6, 0.3, 1.02, 0.4) },
    round: { body: new THREE.IcosahedronGeometry(0.5, 1).translate(0, 0.5, 0) },
    long: { body: long() },
    roll: { body: cyl(0.5, 0.5, 1, 0.5, 10), label: cyl(0.505, 0.505, 0.24, 0.5, 10, true) },
  }
}

export { productDimensions } from '../../productDims'

export const SHAPES_WITH_LABELS: ProductShape[] = ['box', 'tallBox', 'bottle', 'can', 'jar', 'bag', 'carton', 'tray', 'loaf', 'roll']
