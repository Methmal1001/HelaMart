import { listStores, type PublicStore } from '~/services/partnerService'
import { getStoreCatalog } from '~/services/catalogService'
import { getProduct, setActiveCatalog } from '~/data/products'
import { branchServes, rankStores } from '~/lib/area'

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
 * since been restricted/banned/closed is dropped automatically. Choosing a
 * store loads its own catalogue (products, prices, photos, branch stock).
 */
export function useStoreSelection() {
  const choice = useState<StoreChoice | null>('store-choice', () => null)
  const stores = useState<PublicStore[]>('store-list', () => [])
  const { lines, remove } = useCart()
  const { show } = useToasts()
  const { area } = useShoppingArea()

  /** Load the chosen branch's catalogue and drop cart items it doesn't sell. */
  function applyCatalog(announce = false) {
    if (!choice.value) return
    setActiveCatalog(getStoreCatalog(choice.value.storeId, choice.value.branchId))
    const missing = lines.value.filter((l) => !getProduct(l.productId))
    for (const l of missing) remove(l.productId)
    if (announce && missing.length) show(`${missing.length} item${missing.length === 1 ? '' : 's'} not sold at ${choice.value.storeName} ${missing.length === 1 ? 'was' : 'were'} removed from your cart.`)
  }

  /** Client-only: refresh the list of verified stores and validate the saved choice. */
  function refresh() {
    stores.value = listStores()
    const saved = choice.value ?? readStorage(KEY, isChoice)
    const store = saved && stores.value.find((s) => s.id === saved.storeId)
    const branch = store?.branches.find((b) => b.id === saved!.branchId && b.status === 'open')
    if (store && branch) choice.value = { storeId: store.id, branchId: branch.id, storeName: store.name, branchName: branch.name, brandColor: store.brandColor }
    else {
      // No valid choice yet: the nearest open branch to the shopper's area, else the first open store.
      // Prefer the nearest branch that delivers to the shopper's area.
      const best = area.value ? rankStores(stores.value, area.value).find((r) => r.available) : null
      const first = best?.store ?? stores.value.find((s) => s.branches.some((b) => b.status === 'open'))
      const b = best?.serving ?? first?.branches.find((x) => x.status === 'open')
      choice.value = first && b ? { storeId: first.id, branchId: b.id, storeName: first.name, branchName: b.name, brandColor: first.brandColor } : null
    }
    if (choice.value) writeStorage(KEY, choice.value)
    applyCatalog()
  }

  function select(storeId: string, branchId: string) {
    const store = stores.value.find((s) => s.id === storeId)
    const branch = store?.branches.find((b) => b.id === branchId)
    if (!store || !branch || branch.status !== 'open') return
    choice.value = { storeId, branchId, storeName: store.name, branchName: branch.name, brandColor: store.brandColor }
    writeStorage(KEY, choice.value)
    applyCatalog(true)
  }

  /**
   * After the shopper changes area: keep the current branch if it delivers
   * there, otherwise switch to the nearest supermarket that does.
   */
  function alignToArea(announce = false) {
    const a = area.value
    if (!a || !stores.value.length) return
    const ranked = rankStores(stores.value, a)
    const current = ranked.find((r) => r.store.id === choice.value?.storeId)?.branches.find((b) => b.id === choice.value?.branchId)
    if (current?.delivers) return
    const best = ranked.find((r) => r.available)
    if (!best?.serving) {
      if (announce) show(`No HelaMart supermarket delivers to ${a.label} yet. Try a nearby town.`, 'error')
      return
    }
    select(best.store.id, best.serving.id)
    if (announce) show(`Now shopping at ${best.store.name} · ${best.serving.name} — it delivers to ${a.label}.`, 'success')
  }

  /** The chosen supermarket's public record, including its HelaMart-approved branding. */
  const currentStore = computed(() => stores.value.find((s) => s.id === choice.value?.storeId) ?? null)

  /** Does the chosen branch deliver to the shopper's area? (null = no area chosen yet) */
  const choiceServesArea = computed(() => {
    if (!area.value) return null
    const b = currentStore.value?.branches.find((x) => x.id === choice.value?.branchId)
    return !!b && branchServes(b, area.value)
  })

  return { choice, stores, currentStore, choiceServesArea, refresh, select, alignToArea }
}
