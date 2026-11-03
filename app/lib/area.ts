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
  /** Pickup only (the supermarket doesn't deliver from it), open and within the shopper's search radius. */
  collect: boolean
  /** The shopper can order here: it delivers to them, or they can collect from it. */
  usable: boolean
}

export interface RankedStore {
  store: PublicStore
  /** Delivering branches first, then nearest first. */
  branches: RankedBranch[]
  /** Nearest open branch (whether or not it delivers here). */
  nearest: RankedBranch
  /** The branch to shop at: the nearest that delivers here, else the nearest pickup-only branch in reach. */
  serving: RankedBranch | null
  /** The shopper can order from this supermarket (home delivery, or pickup from a branch in reach). */
  available: boolean
  /** Has an open branch within the search radius. */
  nearby: boolean
}

/** Does this branch deliver to the area? (Delivery areas are set by each supermarket.) */
export function branchServes(b: PublicBranch, area: ShopperLocation) {
  return b.status === 'open' && b.deliveryEnabled !== false && coversLocation(b.coverage, area)
}

/** A pickup-only branch the shopper can collect from: open, and within their search radius. */
export function branchCollect(b: PublicBranch, area: ShopperLocation) {
  return b.status === 'open' && b.deliveryEnabled === false && distanceKm(area, b) <= area.radiusKm
}

/** The shopper can order from this branch (delivery to their area, or pickup in reach). */
export const branchUsable = (b: PublicBranch, area: ShopperLocation) => branchServes(b, area) || branchCollect(b, area)

/** Supermarkets that deliver to the area first (nearest first), then the rest by distance. */
export function rankStores(stores: PublicStore[], area: ShopperLocation): RankedStore[] {
  return stores
    .map((store) => {
      const branches = store.branches
        .map((b) => {
          const delivers = branchServes(b, area)
          const collect = branchCollect(b, area)
          return { ...b, distanceKm: distanceKm(area, b), delivers, collect, usable: delivers || collect }
        })
        // Delivering branches first, then pickup-only ones in reach, then the rest; nearest first.
        .sort((a, b) => Number(b.delivers) - Number(a.delivers) || Number(b.collect) - Number(a.collect) || Number(b.status === 'open') - Number(a.status === 'open') || a.distanceKm - b.distanceKm)
      const open = branches.filter((b) => b.status === 'open').sort((a, b) => a.distanceKm - b.distanceKm)
      const nearest = open[0] ?? branches[0]!
      const serving = branches.find((b) => b.usable) ?? null
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
