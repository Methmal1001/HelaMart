import { initAuth } from '~/composables/useAuth'

/** Restores the session after hydration and keeps offers in sync with the signed-in user. */
export default defineNuxtPlugin(() => {
  const { user } = useAuth()
  const { load } = useOffers()
  const { show } = useToasts()

  // After hydration has fully finished (incl. async layouts) so restored state never causes mismatches.
  onNuxtReady(() => {
    void initAuth(() => {
      show('Your session has expired. Please log in again.', 'error', 4500)
    })
    watch(
      () => user.value?.id,
      () => void load(),
      { immediate: true },
    )
  })
})
