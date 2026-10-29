import type { ShopperLocation } from '~/types'
import type { PublicBranch, PublicStore } from '~/services/partnerService'
import { distanceKm } from '~/data/places'

/** Search radius choices offered to shoppers (km). */
export const RADIUS_OPTIONS = [5, 10, 25, 50] as const
export const DEFAULT_RADIUS_KM = 25

export interface RankedBranch extends PublicBranch {
  distanceKm: number
  /** Within the branch's own home-delivery radius. */
  delivers: boolean
}

export interface RankedStore {
  store: PublicStore
  /** Branches nearest first. */
  branches: RankedBranch[]
  nearest: RankedBranch
  /** Has an open branch inside the shopper's search radius. */
  inArea: boolean
}

/** Supermarkets ordered by their nearest open branch; `inArea` marks those within the radius. */
export function rankStores(stores: PublicStore[], area: ShopperLocation): RankedStore[] {
  return stores
    .map((store) => {
      const branches = store.branches
        .map((b) => {
          const d = distanceKm(area, b)
          return { ...b, distanceKm: d, delivers: b.status === 'open' && d <= b.deliveryRadiusKm }
        })
        .sort((a, b) => Number(b.status === 'open') - Number(a.status === 'open') || a.distanceKm - b.distanceKm)
      const nearest = branches.find((b) => b.status === 'open') ?? branches[0]!
      return { store, branches, nearest, inArea: nearest.status === 'open' && nearest.distanceKm <= area.radiusKm }
    })
    .sort((a, b) => Number(b.inArea) - Number(a.inArea) || a.nearest.distanceKm - b.nearest.distanceKm)
}

export function formatKm(km: number) {
  return km < 1 ? 'under 1 km' : km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`
}
