import type { StoreCredit } from '~/types/returns'
import { myStoreCredit } from '~/services/returnService'

/** The signed-in customer's store credit with each supermarket (refunds paid as credit; spent at checkout). */
export function useStoreCredit() {
  const credits = useState<StoreCredit[]>('my-store-credit', () => [])
  const loaded = useState('my-store-credit-loaded', () => false)
  const { authorized, isAuthenticated } = useAuth()

  async function load() {
    if (!isAuthenticated.value) {
      credits.value = []
      return
    }
    try {
      credits.value = await authorized(myStoreCredit)
    } catch {
      /* keep what we had: checkout still works without it */
    } finally {
      loaded.value = true
    }
  }

  const balanceFor = (storeId?: string | null) => credits.value.find((c) => c.storeId === storeId)?.balanceCents ?? 0
  const total = computed(() => credits.value.reduce((sum, c) => sum + c.balanceCents, 0))

  return { credits, loaded, load, balanceFor, total }
}
