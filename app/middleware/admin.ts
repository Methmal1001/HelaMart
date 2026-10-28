import type { Permission } from '~/types/admin'

/**
 * Guards every /admin page: requires a valid back-office session and the
 * page's `permission` (route meta). The API re-checks on every call, so this
 * is defence in depth, not the only barrier.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server) return
  const auth = useAdminAuth()
  await auth.restore()
  if (!auth.isAuthenticated.value) {
    return navigateTo({ path: '/admin/login', query: to.fullPath !== '/admin' ? { redirect: to.fullPath } : {} })
  }
  const needed = to.meta.permission as Permission | Permission[] | undefined
  const list = needed ? (Array.isArray(needed) ? needed : [needed]) : []
  if (list.length && !auth.can(...list)) {
    return navigateTo({ path: '/admin/forbidden', query: { from: to.fullPath } })
  }
})
