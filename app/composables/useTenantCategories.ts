import type { AdminCategory } from '~/types/admin'
import { setActiveCategories } from '~/data/categories'
import { listCategories } from '~/services/admin/tenantApi'
import { toCategory } from '~/services/catalogService'

/**
 * The signed-in supermarket's own categories for admin screens (product and
 * offer forms). Also makes category names/colours resolve to this
 * supermarket's versions everywhere on the page.
 */
export function useTenantCategories() {
  const auth = useAdminAuth()
  const list = useState<AdminCategory[]>('tenant-categories', () => [])

  async function load() {
    list.value = await auth.call(listCategories)
    setActiveCategories(list.value.map(toCategory))
    return list.value
  }

  return { categories: list, load }
}
