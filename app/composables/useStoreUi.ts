export type Panel = 'cart' | 'browse' | 'help' | 'settings' | 'checkout' | 'account' | null

/** Open/closed state for overlays shared across the app. */
export function useStoreUi() {
  const panel = useState<Panel>('ui-panel', () => null)
  const selectedProductId = useState<string | null>('ui-selected-product', () => null)
  const minimapOpen = useState<boolean>('ui-minimap-open', () => true)
  const authDialogOpen = useState<boolean>('auth-dialog-open', () => false)

  /** True whenever an overlay needs keyboard focus (3D movement pauses). */
  const areaFinder = useState<{ open: boolean }>('area-finder', () => ({ open: false }))
  const overlayOpen = computed(() => panel.value !== null || selectedProductId.value !== null || authDialogOpen.value || areaFinder.value.open)

  function openPanel(next: Exclude<Panel, null>) {
    selectedProductId.value = null
    panel.value = next
  }

  function closePanel() {
    panel.value = null
  }

  function openProduct(id: string) {
    selectedProductId.value = id
  }

  function closeProduct() {
    selectedProductId.value = null
  }

  return { panel, selectedProductId, minimapOpen, overlayOpen, openPanel, closePanel, openProduct, closeProduct }
}

/**
 * Start the billing flow: the shopper must be signed in to purchase,
 * so the login dialog opens first when needed.
 */
export function useCheckout() {
  const ui = useStoreUi()
  const { itemCount } = useCart()
  const { requireAuth } = useAuthDialog()
  const { show } = useToasts()

  async function startCheckout(reason = 'Log in to check out and pay for your items.') {
    if (!itemCount.value) {
      show('Your cart is empty — collect some items first.')
      return false
    }
    ui.closeProduct()
    ui.closePanel()
    if (!(await requireAuth(reason))) return false
    ui.openPanel('checkout')
    return true
  }

  return { startCheckout }
}
