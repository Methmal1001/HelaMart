import type { FulfilmentMethod, Offer, Product } from '~/types'
import type { Ref } from 'vue'
import { listMyOffers, listStoreOffers, mergeOffers } from '~/services/offerService'
import { catalogVersion } from '~/data/products'
import type { StoreChoice } from './useStoreSelection'

<<<<<<< HEAD
/**
 * Promotions for the shopper:
 *  - personal offers (signed-in customers, loaded by the auth plugin)
 *  - the chosen supermarket branch's running offers (everyone, including guests)
 */
=======
/** Promotions for the signed-in shopper at the chosen branch (loaded by the auth plugin on login and store change). */
>>>>>>> 8e46a242e2aecf7d41f2156e1dff89087a4c12c2
export function useOffers() {
  const offers = useState<Offer[]>('offers', () => [])
  const storeOffers = useState<Offer[]>('store-offers', () => [])
  const loading = useState<boolean>('offers-loading', () => false)
<<<<<<< HEAD
  const { authorized, isAuthenticated, getAccessToken } = useAuth()
=======
  const store = useState<StoreChoice | null>('store-choice', () => null)
  const { authorized, isAuthenticated } = useAuth()
>>>>>>> 8e46a242e2aecf7d41f2156e1dff89087a4c12c2

  const activeOffers = computed(() => offers.value.filter((o) => isOfferActive(o)))
  /** Everything that prices this shopper's basket at the chosen branch. */
  const allOffers = computed(() => mergeOffers(isAuthenticated.value ? offers.value : [], storeOffers.value))

  async function load() {
    if (!isAuthenticated.value) {
      offers.value = []
      return
    }
    loading.value = true
    try {
      offers.value = await authorized((token) => listMyOffers(token, store.value))
    } catch {
      offers.value = []
    } finally {
      loading.value = false
    }
  }

  async function loadStoreOffers(storeId: string | undefined, branchId: string | undefined) {
    if (!storeId || !branchId) {
      storeOffers.value = []
      return
    }
    try {
      storeOffers.value = await listStoreOffers(storeId, branchId, isAuthenticated.value ? await getAccessToken() : null)
    } catch {
      storeOffers.value = []
    }
  }

  /** Best running item offer for a product (ribbons, was/now prices, shelf tags). */
  function promoFor(p: Pick<Product, 'id' | 'categoryId' | 'priceCents'>) {
    return productPromo(p, allOffers.value)
  }

  return { offers, storeOffers, allOffers, activeOffers, loading, load, loadStoreOffers, promoFor }
}

/** Live bill for the current cart, with every offer the shopper qualifies for applied. */
export function useBill(fulfilment?: Ref<FulfilmentMethod>) {
  const { lines } = useCart()
  const { allOffers } = useOffers()
  return computed(() => {
    void catalogVersion.value
    return priceCart(lines.value, allOffers.value, { fulfilment: fulfilment?.value ?? 'delivery' })
  })
}
