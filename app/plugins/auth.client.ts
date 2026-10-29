import { initAuth } from '~/composables/useAuth'

import type { StoreChoice } from '~/composables/useStoreSelection'

/** Restores the session after hydration and keeps offers in sync with the signed-in user and chosen branch. */
export default defineNuxtPlugin(() => {
  const { user } = useAuth()
  const { load } = useOffers()
  const { show } = useToasts()
  const store = useState<StoreChoice | null>('store-choice', () => null)

  // After hydration has fully finished (incl. async layouts) so restored state never causes mismatches.
  onNuxtReady(() => {
    void initAuth(() => {
      show('Your session has expired. Please log in again.', 'error', 4500)
    })
    watch(
      () => `${user.value?.id ?? ''}|${store.value?.storeId ?? ''}|${store.value?.branchId ?? ''}`,
      () => void load(),
      { immediate: true },
    )
  })
})
