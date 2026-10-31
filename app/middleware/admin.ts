import type { Permission, Scope } from '~/types/admin'

type Needed = Permission | Permission[] | Partial<Record<Scope, Permission | Permission[]>>

/**
 * Guards every /admin page: requires a valid back-office session, the right
 * organisation type (`scope` meta: HelaMart head office vs. supermarket) and
 * the page's permission. The API re-checks on every call (defence in depth).
 */
export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server) return
  const auth = useAdminAuth()
  await auth.restore()
  if (!auth.isAuthenticated.value) {
    return navigateTo({ path: '/admin/login', query: to.fullPath !== '/admin' ? { redirect: to.fullPath } : {} })
  }
  const myScope: Scope = auth.isPlatform.value ? 'platform' : 'tenant'
  const scope = to.meta.scope as Scope | undefined
  if (scope && scope !== myScope) return navigateTo({ path: '/admin/forbidden', query: { from: to.fullPath } })

  const raw = to.meta.permission as Needed | undefined
  const forScope = raw && !Array.isArray(raw) && typeof raw === 'object' ? raw[myScope] : raw
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && !forScope) return navigateTo({ path: '/admin/forbidden', query: { from: to.fullPath } })
  const list = forScope ? (Array.isArray(forScope) ? forScope : [forScope]) : []
  if (list.length && !auth.can(...list)) {
    // Section officers (packers, riders…) without a dashboard start on their order desk.
    if (to.path === '/admin' && myScope === 'tenant') return navigateTo('/admin/order-desk', { replace: true })
    return navigateTo({ path: '/admin/forbidden', query: { from: to.fullPath } })
  }
})
