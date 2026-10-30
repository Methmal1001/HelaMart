import type { Order, OrderProgress } from '~/types'

const NEWS: Record<OrderProgress, (o: Order) => string> = {
  pending: () => 'has been received',
  packing: () => 'is being packed',
  out_for_delivery: (o) => `is out for delivery to ${o.delivery.city}`,
  ready_for_pickup: (o) => `is ready to collect at ${o.storeName ?? 'the store'}${o.branchName ? ` ${o.branchName}` : ''}`,
  delivered: (o) => (o.delivery.method === 'pickup' ? 'has been collected — enjoy!' : 'has been delivered — enjoy!'),
  cancelled: () => 'was cancelled',
  refunded: () => 'was refunded',
}

/**
 * Tell the shopper when a supermarket moves one of their orders on
 * (packed, out for delivery, delivered…). The order desk saves to the shared
 * in-browser store, so a change from the admin portal in another tab arrives
 * as a `storage` event; coming back to the tab checks too.
 */
export default defineNuxtPlugin(() => {
  const { orders, loaded, load } = useMyOrders()
  const { isAuthenticated } = useAuth()
  const { show } = useToasts()

  /** The last status each order was announced at — every change is announced once. */
  const announced = new Map<string, OrderProgress | undefined>()
  watch(orders, (list) => {
    for (const o of list) if (!announced.has(o.id)) announced.set(o.id, o.progress)
  })

  let running: Promise<void> | null = null
  let again = false
  async function check() {
    if (!isAuthenticated.value || !loaded.value) return
    if (running) {
      again = true
      return running
    }
    running = (async () => {
      do {
        again = false
        await load()
        for (const o of orders.value) {
          const was = announced.get(o.id)
          if (!o.progress || was === o.progress) continue
          announced.set(o.id, o.progress)
          if (was === undefined) continue
          show(`Order ${o.number} ${NEWS[o.progress](o)}`, o.progress === 'cancelled' || o.progress === 'refunded' ? 'error' : 'success', 6000)
        }
      } while (again)
    })().finally(() => (running = null))
    return running
  }

  // Know the shopper's orders once they're signed in, so changes can be announced.
  watch(isAuthenticated, (v) => {
    if (v && !loaded.value) void load()
    if (!v) announced.clear()
  }, { immediate: true })

  window.addEventListener('storage', (e) => {
    if (e.key === 'helamart:platform-db:v2') void check()
  })
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void check())
})
