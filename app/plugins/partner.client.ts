/** Picks up a saved partner (supermarket owner) session after hydration. */
export default defineNuxtPlugin(() => {
  onNuxtReady(() => void usePartnerAuth().restore())
})
