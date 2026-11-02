import type { DeliveryCoverage } from '~/types/admin'
import { PLACES, inSriLanka } from '~/data/places'
import { maxReachKm, pointInPolygon, polygonAreaKm2, selfIntersects, type LatLng } from './geo'

/**
 * Delivery-area rules shared by the admin editor, the admin API and the
 * shopper side, so "does this branch deliver here?" is answered one way.
 */

export const COVERAGE_LIMITS = { minPoints: 3, maxPoints: 80, maxAreaKm2: 2500, maxPlaces: 150, placeMax: 60 }

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/** Inside the drawn area, or the shopper's town is one of the named places. */
export function coversLocation(coverage: Pick<DeliveryCoverage, 'polygon' | 'places'> | undefined, loc: { lat: number; lng: number; label?: string }) {
  if (!coverage || coverage.polygon.length < 3) return false
  if (pointInPolygon(loc.lat, loc.lng, coverage.polygon)) return true
  const label = loc.label ? norm(loc.label) : ''
  return !!label && coverage.places.some((p) => norm(p) === label)
}

/** Known towns that fall inside a drawn area (suggested as "included places"). */
export function townsInside(polygon: LatLng[]) {
  if (polygon.length < 3) return []
  return PLACES.filter((p) => pointInPolygon(p.lat, p.lng, polygon)).map((p) => p.name)
}

export function cleanPlaces(list: string[]) {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of list) {
    const name = String(raw ?? '').replace(/[<>"]/g, '').replace(/\s+/g, ' ').trim().slice(0, COVERAGE_LIMITS.placeMax)
    const key = norm(name)
    if (name.length < 2 || seen.has(key)) continue
    seen.add(key)
    out.push(name)
  }
  return out
}

/** Problems with a proposed delivery area (empty = valid). */
export function coverageProblems(polygon: LatLng[], places: string[], branch: { lat: number; lng: number }): string[] {
  const p: string[] = []
  const L = COVERAGE_LIMITS
  if (!Array.isArray(polygon) || polygon.length < L.minPoints) p.push(`Draw the delivery area on the map (at least ${L.minPoints} points).`)
  else {
    if (polygon.length > L.maxPoints) p.push(`Use at most ${L.maxPoints} points.`)
    if (polygon.some((pt) => !Array.isArray(pt) || !inSriLanka(Number(pt[0]), Number(pt[1])))) p.push('Every point must be in Sri Lanka.')
    else {
      if (selfIntersects(polygon)) p.push('The area’s edges cross each other — move the points so the shape doesn’t twist.')
      const area = polygonAreaKm2(polygon)
      if (area < 0.5) p.push('The area is too small.')
      if (area > L.maxAreaKm2) p.push(`The area is too large (${Math.round(area)} km²; max ${L.maxAreaKm2} km²). Split it across branches.`)
      if (!pointInPolygon(branch.lat, branch.lng, polygon) && maxReachKm(branch.lat, branch.lng, polygon) > 5) p.push('The branch itself must be inside (or right next to) its delivery area.')
    }
  }
  if (!places.length) p.push('List at least one city or village you deliver to.')
  if (places.length > L.maxPlaces) p.push(`List at most ${L.maxPlaces} places.`)
  return p
}
