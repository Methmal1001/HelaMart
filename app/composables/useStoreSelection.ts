import { listStores, type PublicStore } from '~/services/partnerService'
import { getStoreCatalog } from '~/services/catalogService'
import { getProduct, setActiveCatalog } from '~/data/products'
import { formatKm, rankStores } from '~/lib/area'

export interface StoreChoice {
  storeId: string
  branchId: string
  storeName: string
  branchName: string
  brandColor: string
}

const KEY = 'helamart:store-choice:v1'

/** One store-list request at a time, shared by every caller. */
let inflight: Promise<void> | null = null
/** The latest catalogue request; older responses are ignored. */
let catalogRequest = 0

function isChoice(v: unknown): v is StoreChoice {
  return !!v && typeof v === 'object' && typeof (v as StoreChoice).storeId === 'string' && typeof (v as StoreChoice).branchId === 'string'
}

/**
 * Which verified supermarket + branch the shopper is buying from.
 * Only approved, active supermarkets are offered; a saved choice that has
 * since been restricted/banned/closed is dropped automatically. Choosing a
 * store loads its own catalogue (products, prices, photos, branch stock)
 * from the HelaMart API.
 */
export function useStoreSelection() {
  const choice = useState<StoreChoice | null>('store-choice', () => null)
  const stores = useState<PublicStore[]>('store-list', () => [])
  const { lines, remove } = useCart()
  const { show } = useToasts()
  const { area } = useShoppingArea()

  /** Load the chosen branch's catalogue and drop cart items it doesn't sell. */
  async function applyCatalog(announce = false) {
    const current = choice.value
    if (!current) return
    const request = ++catalogRequest
    let list
    try {
      list = await getStoreCatalog(current.storeId, current.branchId)
    } catch {
      if (request === catalogRequest) show(`Couldn’t load ${current.storeName}’s shelves. Check your connection and try again.`, 'error')
      return
    }
    // The shopper picked another branch while this one was loading.
    if (request !== catalogRequest) return
    setActiveCatalog(list)
    const missing = lines.value.filter((l) => !getProduct(l.productId))
    for (const l of missing) remove(l.productId)
    if (announce && missing.length) show(`${missing.length} item${missing.length === 1 ? '' : 's'} not sold at ${current.storeName} ${missing.length === 1 ? 'was' : 'were'} removed from your cart.`)
  }

  /** Client-only: refresh the list of verified stores and validate the saved choice. */
  function refresh(): Promise<void> {
    inflight ??= load().finally(() => (inflight = null))
    return inflight
  }

  async function load() {
    const firstLoad = !stores.value.length
    try {
      stores.value = await listStores()
    } catch {
      show('Can’t reach HelaMart right now. Supermarkets will appear once you’re back online.', 'error')
      return
    }
    const saved = choice.value ?? readStorage(KEY, isChoice)
    const store = saved && stores.value.find((s) => s.id === saved.storeId)
    const branch = store?.branches.find((b) => b.id === saved!.branchId && b.status === 'open')
    if (store && branch) choice.value = { storeId: store.id, branchId: branch.id, storeName: store.name, branchName: branch.name, brandColor: store.brandColor }
    else {
      // No valid choice yet: the nearest open branch to the shopper's area, else the first open store.
      const nearest = area.value ? rankStores(stores.value, area.value).find((r) => r.nearest.status === 'open') : null
      const first = nearest?.store ?? stores.value.find((s) => s.branches.some((b) => b.status === 'open'))
      const b = nearest?.nearest ?? first?.branches.find((x) => x.status === 'open')
      choice.value = first && b ? { storeId: first.id, branchId: b.id, storeName: first.name, branchName: b.name, brandColor: first.brandColor } : null
    }
    if (choice.value) writeStorage(KEY, choice.value)
    // The area may have been set before the store list arrived: make sure the choice is inside it.
    if (firstLoad) alignToArea()
    await applyCatalog()
  }

  function select(storeId: string, branchId: string): Promise<void> {
    const store = stores.value.find((s) => s.id === storeId)
    const branch = store?.branches.find((b) => b.id === branchId)
    if (!store || !branch || branch.status !== 'open') return Promise.resolve()
    choice.value = { storeId, branchId, storeName: store.name, branchName: branch.name, brandColor: store.brandColor }
    writeStorage(KEY, choice.value)
    return applyCatalog(true)
  }

  /**
   * After the shopper changes area: keep the current branch if it's inside the
   * area, otherwise switch to the nearest supermarket that is.
   */
  function alignToArea(announce = false) {
    const a = area.value
    if (!a || !stores.value.length) return
    const ranked = rankStores(stores.value, a)
    const current = ranked.find((r) => r.store.id === choice.value?.storeId)?.branches.find((b) => b.id === choice.value?.branchId)
    if (current && current.status === 'open' && current.distanceKm <= a.radiusKm) return
    const best = ranked.find((r) => r.inArea)
    if (!best) {
      if (announce) show(`No HelaMart supermarkets within ${a.radiusKm} km of ${a.label} yet. Try a wider area or pick one further away.`)
      return
    }
    void select(best.store.id, best.nearest.id)
    if (announce) show(`Now shopping at ${best.store.name} · ${best.nearest.name} — ${formatKm(best.nearest.distanceKm)} from ${a.label}.`, 'success')
  }

  /** The chosen supermarket's public record, including its HelaMart-approved branding. */
  const currentStore = computed(() => stores.value.find((s) => s.id === choice.value?.storeId) ?? null)

  return { choice, stores, currentStore, refresh, select, alignToArea }
}
