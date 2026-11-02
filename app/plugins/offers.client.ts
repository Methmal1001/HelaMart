/** Keeps the chosen supermarket branch's offers loaded (and personalised after sign-in). */
export default defineNuxtPlugin(() => {
  const { choice } = useStoreSelection()
  const { user } = useAuth()
  const { loadStoreOffers } = useOffers()
  const router = useRouter()

  onNuxtReady(() => {
    watch(
      () => [choice.value?.storeId, choice.value?.branchId, user.value?.id, router.currentRoute.value.path.startsWith('/admin')] as const,
      ([storeId, branchId, , admin]) => {
        if (!admin) void loadStoreOffers(storeId, branchId)
      },
      { immediate: true },
    )
    // Scheduled offers start and end on time without a page reload.
    setInterval(() => {
      if (!document.hidden && !router.currentRoute.value.path.startsWith('/admin')) void loadStoreOffers(choice.value?.storeId, choice.value?.branchId)
    }, 60_000)
  })
})
