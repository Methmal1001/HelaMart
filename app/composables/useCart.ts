import type { CartLine, CartLineView } from '~/types'
import { getProduct } from '~/data/products'
import { DELIVERY_FEE_CENTS } from '~/utils/pricing'

export const MAX_LINE_QUANTITY = 99

export function isCartLines(value: unknown): value is CartLine[] {
  return (
    Array.isArray(value) &&
    value.every(
      (l) =>
        l &&
        typeof l === 'object' &&
        typeof (l as CartLine).productId === 'string' &&
        Number.isInteger((l as CartLine).quantity) &&
        (l as CartLine).quantity > 0,
    )
  )
}

/**
 * Single shared cart store. All components read/write through this composable,
 * so the 3D product panel, the catalogue and the cart drawer always agree.
 */
export function useCart() {
  const lines = useState<CartLine[]>('cart-lines', () => [])
  const lastAdded = useState<{ productId: string; at: number } | null>('cart-last-added', () => null)

  const items = computed<CartLineView[]>(() =>
    lines.value.flatMap((line) => {
      const product = getProduct(line.productId)
      // Drop lines for products that no longer exist in the catalogue.
      if (!product) return []
      return [{ ...line, product, lineTotalCents: product.priceCents * line.quantity }]
    }),
  )

  const itemCount = computed(() => items.value.reduce((sum, l) => sum + l.quantity, 0))
  const subtotalCents = computed(() => items.value.reduce((sum, l) => sum + l.lineTotalCents, 0))
  const deliveryFeeCents = computed(() => (items.value.length ? DELIVERY_FEE_CENTS : 0))
  const totalCents = computed(() => subtotalCents.value + deliveryFeeCents.value)

  function quantityOf(productId: string): number {
    return lines.value.find((l) => l.productId === productId)?.quantity ?? 0
  }

  function add(productId: string, quantity = 1) {
    if (!getProduct(productId) || quantity <= 0) return
    const existing = lines.value.find((l) => l.productId === productId)
    if (existing) {
      existing.quantity = Math.min(MAX_LINE_QUANTITY, existing.quantity + quantity)
    } else {
      lines.value.push({ productId, quantity: Math.min(MAX_LINE_QUANTITY, quantity) })
    }
    lastAdded.value = { productId, at: Date.now() }
  }

  function setQuantity(productId: string, quantity: number) {
    const q = Math.floor(quantity)
    if (q <= 0) return remove(productId)
    const line = lines.value.find((l) => l.productId === productId)
    if (line) line.quantity = Math.min(MAX_LINE_QUANTITY, q)
  }

  function remove(productId: string) {
    lines.value = lines.value.filter((l) => l.productId !== productId)
  }

  function clear() {
    lines.value = []
  }

  return {
    lines,
    items,
    itemCount,
    subtotalCents,
    deliveryFeeCents,
    totalCents,
    lastAdded,
    quantityOf,
    add,
    setQuantity,
    remove,
    clear,
  }
}
