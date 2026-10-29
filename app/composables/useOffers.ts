import type { FulfilmentMethod, Offer } from '~/types'
import type { Ref } from 'vue'
import { listMyOffers } from '~/services/offerService'
import { catalogVersion } from '~/data/products'

/** Promotions for the signed-in shopper (loaded by the auth plugin on login). */
export function useOffers() {
  const offers = useState<Offer[]>('offers', () => [])
  const loading = useState<boolean>('offers-loading', () => false)
  const { authorized, isAuthenticated } = useAuth()

  const activeOffers = computed(() => offers.value.filter((o) => isOfferActive(o)))

  async function load() {
    if (!isAuthenticated.value) {
      offers.value = []
      return
    }
    loading.value = true
    try {
      offers.value = await authorized(listMyOffers)
    } catch {
      offers.value = []
    } finally {
      loading.value = false
    }
  }

  return { offers, activeOffers, loading, load }
}

/** Live bill for the current cart, with the shopper's offers applied when signed in. */
export function useBill(fulfilment?: Ref<FulfilmentMethod>) {
  const { lines } = useCart()
  const { offers } = useOffers()
  const { isAuthenticated } = useAuth()
  return computed(() => {
    void catalogVersion.value
    return priceCart(lines.value, isAuthenticated.value ? offers.value : [], { fulfilment: fulfilment?.value ?? 'delivery' })
  })
}
