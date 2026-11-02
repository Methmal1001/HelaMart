/**
 * Small geometry helpers for delivery areas. Polygons are lists of
 * [lat, lng] points; areas are small enough (a few tens of km) that a local
 * equirectangular projection is accurate.
 */

export type LatLng = [number, number]

const KM_PER_DEG_LAT = 110.574
const kmPerDegLng = (lat: number) => 111.32 * Math.cos((lat * Math.PI) / 180)

/** Ray casting: is the point inside the polygon? */
export function pointInPolygon(lat: number, lng: number, poly: LatLng[]) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [yi, xi] = poly[i]!
    const [yj, xj] = poly[j]!
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Area in km² (shoelace on a local projection). */
export function polygonAreaKm2(poly: LatLng[]) {
  if (poly.length < 3) return 0
  const lat0 = poly.reduce((s, p) => s + p[0], 0) / poly.length
  const kx = kmPerDegLng(lat0)
  let a = 0
  for (let i = 0; i < poly.length; i++) {
    const [y1, x1] = poly[i]!
    const [y2, x2] = poly[(i + 1) % poly.length]!
    a += x1 * kx * (y2 * KM_PER_DEG_LAT) - x2 * kx * (y1 * KM_PER_DEG_LAT)
  }
  return Math.abs(a) / 2
}

function segmentsCross(a: LatLng, b: LatLng, c: LatLng, d: LatLng) {
  const o = (p: LatLng, q: LatLng, r: LatLng) => Math.sign((q[1] - p[1]) * (r[0] - p[0]) - (q[0] - p[0]) * (r[1] - p[1]))
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0
}

/** True when edges of the polygon cross each other (a "bow-tie" shape). */
export function selfIntersects(poly: LatLng[]) {
  const n = poly.length
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (Math.abs(i - j) <= 1 || (i === 0 && j === n - 1)) continue
      if (segmentsCross(poly[i]!, poly[(i + 1) % n]!, poly[j]!, poly[(j + 1) % n]!)) return true
    }
  }
  return false
}

/** Regular polygon approximating a circle — a quick starting shape for the editor. */
export function circlePolygon(lat: number, lng: number, radiusKm: number, sides = 16, wobble = 0): LatLng[] {
  const out: LatLng[] = []
  for (let i = 0; i < sides; i++) {
    const t = (i / sides) * Math.PI * 2
    const r = radiusKm * (1 + (wobble ? Math.sin(i * 2.7 + lat * 10) * wobble : 0))
    out.push([+(lat + (r * Math.sin(t)) / KM_PER_DEG_LAT).toFixed(5), +(lng + (r * Math.cos(t)) / kmPerDegLng(lat)).toFixed(5)])
  }
  return out
}

/** Furthest distance (km) from a point to the polygon's corners. */
export function maxReachKm(lat: number, lng: number, poly: LatLng[]) {
  return poly.reduce((m, [y, x]) => Math.max(m, Math.hypot((y - lat) * KM_PER_DEG_LAT, (x - lng) * kmPerDegLng(lat))), 0)
}

export function centroid(poly: LatLng[]): { lat: number; lng: number } {
  return { lat: poly.reduce((s, p) => s + p[0], 0) / poly.length, lng: poly.reduce((s, p) => s + p[1], 0) / poly.length }
}
