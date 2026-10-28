import { listStores, type PublicStore } from '~/services/partnerService'

export interface StoreChoice {
  storeId: string
  branchId: string
  storeName: string
  branchName: string
  brandColor: string
}

const KEY = 'helamart:store-choice:v1'

function isChoice(v: unknown): v is StoreChoice {
  return !!v && typeof v === 'object' && typeof (v as StoreChoice).storeId === 'string' && typeof (v as StoreChoice).branchId === 'string'
}

/**
 * Which verified supermarket + branch the shopper is buying from.
 * Only approved, active supermarkets are offered; a saved choice that has
 * since been restricted/banned/closed is dropped automatically.
 */
export function useStoreSelection() {
  const choice = useState<StoreChoice | null>('store-choice', () => null)
  const stores = useState<PublicStore[]>('store-list', () => [])

  /** Client-only: refresh the list of verified stores and validate the saved choice. */
  function refresh() {
    stores.value = listStores()
    const saved = choice.value ?? readStorage(KEY, isChoice)
    const store = saved && stores.value.find((s) => s.id === saved.storeId)
    const branch = store?.branches.find((b) => b.id === saved!.branchId && b.status === 'open')
    if (store && branch) choice.value = { storeId: store.id, branchId: branch.id, storeName: store.name, branchName: branch.name, brandColor: store.brandColor }
    else {
      const first = stores.value.find((s) => s.branches.some((b) => b.status === 'open'))
      const b = first?.branches.find((x) => x.status === 'open')
      choice.value = first && b ? { storeId: first.id, branchId: b.id, storeName: first.name, branchName: b.name, brandColor: first.brandColor } : null
    }
    if (choice.value) writeStorage(KEY, choice.value)
  }

  function select(storeId: string, branchId: string) {
    const store = stores.value.find((s) => s.id === storeId)
    const branch = store?.branches.find((b) => b.id === branchId)
    if (!store || !branch || branch.status !== 'open') return
    choice.value = { storeId, branchId, storeName: store.name, branchName: branch.name, brandColor: store.brandColor }
    writeStorage(KEY, choice.value)
  }

  return { choice, stores, refresh, select }
}
