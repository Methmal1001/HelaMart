import type { ShopperLocation } from '~/types'
import { DISTRICTS } from '~/data/sriLanka'
import { inSriLanka } from '~/data/places'

const GUEST_KEY = 'helamart:area:v1'

export function isShopperLocation(v: unknown): v is ShopperLocation {
  const l = v as ShopperLocation
  return !!l && typeof l === 'object' && typeof l.label === 'string' && (DISTRICTS as readonly string[]).includes(l.district) && inSriLanka(l.lat, l.lng) && typeof l.radiusKm === 'number'
}

/**
 * The area a shopper is shopping in. Signed-in customers keep it on their
 * account (so it follows them to any device); guests keep it in this browser.
 * The store picker and the 3D area finder list supermarkets near it.
 */
export function useShoppingArea() {
  const area = useState<ShopperLocation | null>('shopping-area', () => null)
  const finder = useState<{ open: boolean; reason?: string }>('area-finder', () => ({ open: false }))
  const { isAuthenticated, savePreferredLocation } = useAuth()
  const { show } = useToasts()

  /** Change the area (saved to the account when signed in). */
  async function setArea(loc: ShopperLocation) {
    area.value = loc
    writeStorage(GUEST_KEY, loc)
    if (!isAuthenticated.value) return
    try {
      await savePreferredLocation(loc)
    } catch {
      show('Couldn’t save your area to your account — it’s kept on this device for now.', 'error')
    }
  }

  /** Guest choice from this browser (client only). */
  function guestArea() {
    return readStorage(GUEST_KEY, isShopperLocation)
  }

  function openFinder(reason?: string) {
    finder.value = { open: true, reason }
  }
  function closeFinder() {
    finder.value = { open: false }
  }

  return { area, finder, setArea, guestArea, openFinder, closeFinder }
}
