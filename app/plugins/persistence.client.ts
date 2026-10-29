import { isCartLines } from '~/composables/useCart'
import { isAvatarKind } from '~/composables/useAvatar'
import { isQualityLevel } from '~/composables/useStoreExperience'

/**
 * Restores the cart, avatar and quality preference from localStorage after
 * hydration (avoids SSR/client markup mismatches), then keeps them saved.
 */
export default defineNuxtPlugin(() => {
  const { lines } = useCart()
  const { avatar } = useAvatar()
  const { quality } = useStoreExperience()
  const stores = useStoreSelection()
  const router = useRouter()

  // After hydration has fully finished (incl. async layouts) so restored state never causes mismatches.
  onNuxtReady(() => {
    const savedCart = readStorage(STORAGE_KEYS.cart, isCartLines)
    if (savedCart && !lines.value.length) lines.value = savedCart
    const savedAvatar = readStorage(STORAGE_KEYS.avatar, isAvatarKind)
    if (savedAvatar && !avatar.value) avatar.value = savedAvatar
    quality.value = readStorage(STORAGE_KEYS.quality, isQualityLevel) ?? suggestQuality()
    // Storefront pages show the chosen supermarket's own catalogue (prices, photos, stock).
    if (!stores.choice.value && !router.currentRoute.value.path.startsWith('/admin')) stores.refresh()

    watch(lines, (v) => writeStorage(STORAGE_KEYS.cart, v), { deep: true })
    watch(avatar, (v) => v && writeStorage(STORAGE_KEYS.avatar, v))
    watch(quality, (v) => writeStorage(STORAGE_KEYS.quality, v))

    // Keep tabs in sync.
    window.addEventListener('storage', (e) => {
      if (e.key === STORAGE_KEYS.cart) {
        const next = readStorage(STORAGE_KEYS.cart, isCartLines)
        if (next) lines.value = next
      }
    })
  })
})
