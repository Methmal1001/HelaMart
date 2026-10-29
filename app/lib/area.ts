import type { ShopperLocation } from '~/types'
import type { PublicBranch, PublicStore } from '~/services/partnerService'
import { distanceKm } from '~/data/places'
import { coversLocation } from './coverage'

/** Search radius choices offered to shoppers (km) — how far to look when exploring the map. */
export const RADIUS_OPTIONS = [5, 10, 25, 50] as const
export const DEFAULT_RADIUS_KM = 25

export interface RankedBranch extends PublicBranch {
  distanceKm: number
  /** Open, and the shopper's area is inside this branch's delivery area. */
  delivers: boolean
}

export interface RankedStore {
  store: PublicStore
  /** Delivering branches first, then nearest first. */
  branches: RankedBranch[]
  /** Nearest open branch (whether or not it delivers here). */
  nearest: RankedBranch
  /** Nearest branch that delivers to the shopper's area. */
  serving: RankedBranch | null
  /** The supermarket delivers to the shopper's area. */
  available: boolean
  /** Has an open branch within the search radius. */
  nearby: boolean
}

/** Does this branch deliver to the area? (Delivery areas are set by each supermarket.) */
export function branchServes(b: PublicBranch, area: ShopperLocation) {
  return b.status === 'open' && coversLocation(b.coverage, area)
}

/** Supermarkets that deliver to the area first (nearest first), then the rest by distance. */
export function rankStores(stores: PublicStore[], area: ShopperLocation): RankedStore[] {
  return stores
    .map((store) => {
      const branches = store.branches
        .map((b) => ({ ...b, distanceKm: distanceKm(area, b), delivers: branchServes(b, area) }))
        .sort((a, b) => Number(b.delivers) - Number(a.delivers) || Number(b.status === 'open') - Number(a.status === 'open') || a.distanceKm - b.distanceKm)
      const open = branches.filter((b) => b.status === 'open').sort((a, b) => a.distanceKm - b.distanceKm)
      const nearest = open[0] ?? branches[0]!
      const serving = branches.find((b) => b.delivers) ?? null
      return { store, branches, nearest, serving, available: !!serving, nearby: !!open[0] && open[0].distanceKm <= area.radiusKm }
    })
    .sort(
      (a, b) =>
        Number(b.available) - Number(a.available) ||
        (a.serving && b.serving ? a.serving.distanceKm - b.serving.distanceKm : a.nearest.distanceKm - b.nearest.distanceKm),
    )
}

export function formatKm(km: number) {
  return km < 1 ? 'under 1 km' : km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`
}
