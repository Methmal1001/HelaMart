export type Panel = 'cart' | 'browse' | 'help' | 'settings' | null

/** Open/closed state for overlays shared across the app. */
export function useStoreUi() {
  const panel = useState<Panel>('ui-panel', () => null)
  const selectedProductId = useState<string | null>('ui-selected-product', () => null)
  const minimapOpen = useState<boolean>('ui-minimap-open', () => true)

  /** True whenever an overlay needs keyboard focus (3D movement pauses). */
  const overlayOpen = computed(() => panel.value !== null || selectedProductId.value !== null)

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
