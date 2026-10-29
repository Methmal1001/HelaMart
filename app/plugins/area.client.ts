import type { ShopperLocation } from '~/types'
import { DEFAULT_RADIUS_KM } from '~/lib/area'
import { findPlace } from '~/data/places'

/**
 * Shopping area lifecycle:
 *  - guests: restored from this browser
 *  - sign-in with a saved area: that area is used everywhere
 *  - sign-in without one: the area already chosen (or the town of the chosen
 *    branch) is saved to the account; if there's nothing to go on, the
 *    shopper is asked to pick one
 *  - whenever the area changes, the store selection follows it
 */
export default defineNuxtPlugin(() => {
  const { user, status } = useAuth()
  const shopping = useShoppingArea()
  const stores = useStoreSelection()
  const { show } = useToasts()
  const router = useRouter()
  const onStorefront = () => !router.currentRoute.value.path.startsWith('/admin')

  /** Best guess when nothing has been chosen: the town of the branch being shopped at. */
  function fromChosenBranch(): ShopperLocation | null {
    const c = stores.choice.value
    const b = stores.stores.value.find((s) => s.id === c?.storeId)?.branches.find((x) => x.id === c?.branchId)
    if (!b) return null
    const town = findPlace(b.city, b.district)
    return { label: town?.name ?? b.city, district: b.district, lat: b.lat, lng: b.lng, radiusKm: DEFAULT_RADIUS_KM, source: 'town' }
  }

  onNuxtReady(() => {
    if (!shopping.area.value) shopping.area.value = shopping.guestArea()

    watch(
      () => (status.value === 'authenticated' ? user.value?.id : null),
      async (id) => {
        if (!id) return
        const saved = user.value?.preferredLocation
        if (saved) {
          shopping.area.value = saved
          return
        }
        if (!onStorefront()) return
        if (!stores.stores.value.length) stores.refresh()
        const loc = shopping.area.value ?? fromChosenBranch()
        if (loc) {
          await shopping.setArea(loc)
          show(`Your shopping area (${loc.label}) is saved to your account. Change it anytime from “Change area”.`, 'success', 4500)
        } else {
          shopping.openFinder('Choose your shopping area — we’ll show the supermarkets near you.')
        }
      },
      { immediate: true },
    )

    // A new area (or radius) re-picks the store if the current one is outside it.
    watch(
      () => (shopping.area.value ? `${shopping.area.value.lat},${shopping.area.value.lng},${shopping.area.value.radiusKm}` : ''),
      (key, previous) => {
        if (key && onStorefront()) stores.alignToArea(previous !== undefined)
      },
      { immediate: true },
    )
  })
})
