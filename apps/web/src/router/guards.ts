import type { RouteLocationNormalized, RouteLocationRaw } from 'vue-router'

declare module 'vue-router' {
  interface RouteMeta {
    /** Accessible without signing in. Routes require authentication by default. */
    public?: boolean
    /** Only for signed-out users (login, register). */
    guestOnly?: boolean
    /** Requires the global admin role. */
    requiresAdmin?: boolean
  }
}

export interface AccessContext {
  isAuthenticated: boolean
  isVerified: boolean
  isAdmin: boolean
}

/**
 * Decides whether navigation to `to` is allowed. Returns `true` or a redirect.
 * This is a UX convenience; the API enforces all permissions (M1-02, M1-05).
 */
export function resolveAccess(
  to: Pick<RouteLocationNormalized, 'meta' | 'fullPath' | 'name'>,
  session: AccessContext,
): true | RouteLocationRaw {
  if (to.meta.guestOnly && session.isAuthenticated) return { name: 'dashboard' }
  if (to.meta.public) return true
  if (!session.isAuthenticated) return { name: 'login', query: { redirect: to.fullPath } }
  if (!session.isVerified) return { name: 'verify-email' }
  if (to.meta.requiresAdmin && !session.isAdmin) return { name: 'forbidden' }
  return true
}
