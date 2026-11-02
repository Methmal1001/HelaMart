import type { Order, OrderProgress } from '~/types'
import { listMyOrders } from '~/services/orderService'

/**
 * The signed-in customer's past orders (bills can be reopened and reprinted
 * any time). Loaded when the account or orders panel opens, and after checkout.
 */
export function useMyOrders() {
  const orders = useState<Order[]>('my-orders', () => [])
  const loaded = useState<boolean>('my-orders-loaded', () => false)
  const loading = useState<boolean>('my-orders-loading', () => false)
  const error = useState<string>('my-orders-error', () => '')
  /** The bill being viewed in the orders panel (null = the list). */
  const viewingId = useState<string | null>('my-orders-viewing', () => null)
  const { authorized, isAuthenticated } = useAuth()

  async function load() {
    if (!isAuthenticated.value) {
      orders.value = []
      loaded.value = false
      return
    }
    loading.value = true
    error.value = ''
    try {
      orders.value = await authorized(listMyOrders)
      loaded.value = true
    } catch {
      error.value = 'Couldn’t load your orders. Check your connection and try again.'
    } finally {
      loading.value = false
    }
  }

  /** Open the orders panel, optionally straight on one bill. */
  function openOrders(orderId: string | null = null) {
    viewingId.value = orderId
    useStoreUi().openPanel('orders')
  }

  return { orders, loaded, loading, error, viewingId, load, openOrders }
}

export const PROGRESS: Record<OrderProgress, { label: string; tone: string }> = {
  pending: { label: 'Order received', tone: 'bg-hela-gold-100 text-[#6d5622]' },
  packing: { label: 'Being packed', tone: 'bg-[#E6F0FB] text-[#1F4E8C]' },
  out_for_delivery: { label: 'Out for delivery', tone: 'bg-[#E6F0FB] text-[#1F4E8C]' },
  ready_for_pickup: { label: 'Ready to collect', tone: 'bg-hela-green-50 text-hela-green' },
  delivered: { label: 'Delivered', tone: 'bg-hela-green-50 text-hela-green' },
  cancelled: { label: 'Cancelled', tone: 'bg-[#FBEAEA] text-[#8A2E2E]' },
  refunded: { label: 'Refunded', tone: 'bg-[#FBEAEA] text-[#8A2E2E]' },
}

/** Status chip text for an order ("Collected" for store pickups). */
export function progressOf(o: Order) {
  const p = PROGRESS[o.progress ?? 'pending']
  if (o.progress === 'delivered') return o.delivery.method === 'pickup' ? { ...p, label: 'Collected' } : p
  // Where it is in the supermarket's own sections ("Packing your items", "Waiting for verification"…).
  return o.stageLabel && o.progress !== 'cancelled' && o.progress !== 'refunded' ? { ...p, label: o.stageLabel } : p
}
