import { initAuth } from '~/composables/useAuth'

/** Restores the session after hydration and keeps offers in sync with the signed-in user. */
export default defineNuxtPlugin((nuxtApp) => {
  const { user } = useAuth()
  const { load } = useOffers()
  const { show } = useToasts()

  nuxtApp.hook('app:mounted', () => {
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
