import { setActiveCatalog } from '~/data/products'
import { backendEnabled } from '~/services/http'

/**
 * With the HelaMart API, shelves start empty and fill with the chosen branch's
 * catalogue from GET /stores/{id}/catalog — the built-in sample products are
 * only for the offline demo (no apiBase).
 */
export default defineNuxtPlugin({
  name: 'catalog',
  enforce: 'pre',
  setup() {
    if (backendEnabled()) setActiveCatalog([])
  },
})
