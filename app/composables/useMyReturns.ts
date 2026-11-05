import type { ReturnRequest } from '~/types/returns'
import { myReturns } from '~/services/returnService'

/** The signed-in customer's return requests (loaded with "Your orders"). */
export function useMyReturns() {
  const returns = useState<ReturnRequest[]>('my-returns', () => [])
  const { authorized, isAuthenticated } = useAuth()

  async function load() {
    if (!isAuthenticated.value) return (returns.value = [])
    try {
      returns.value = await authorized(myReturns)
    } catch {
      /* keep what we had; the orders list still works */
    }
  }

  const forOrder = (orderId: string) => returns.value.filter((r) => r.orderId === orderId)
  /** The most relevant open request on an order (for the list badge). */
  const openFor = (orderId: string) => forOrder(orderId).find((r) => r.status === 'requested' || r.status === 'approved')

  function upsert(r: ReturnRequest) {
    returns.value = [r, ...returns.value.filter((x) => x.id !== r.id)]
  }

  return { returns, load, forOrder, openFor, upsert }
}

export const RETURN_TONE: Record<string, string> = {
  requested: 'bg-[#FFF4D6] text-[#7A5600]',
  approved: 'bg-[#E3EEF9] text-[#1F4E7A]',
  refunded: 'bg-hela-green-50 text-hela-green',
  replaced: 'bg-hela-green-50 text-hela-green',
  rejected: 'bg-[#FBEAEA] text-[#8A2E2E]',
  withdrawn: 'bg-[#F1F1EF] text-[#55595C]',
}
