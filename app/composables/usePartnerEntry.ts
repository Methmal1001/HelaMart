/** "Sell on HelaMart": applying needs a partner account (not a shopper account), so ask to log in or register first. */
export function usePartnerEntry() {
  const { restore, isAuthenticated, requestLogin } = usePartnerAuth()

  async function openPartner() {
    await restore()
    if (isAuthenticated.value || (await requestLogin('Log in or register as a partner to bring your supermarket to HelaMart.'))) await navigateTo('/partner')
  }

  return { openPartner }
}
