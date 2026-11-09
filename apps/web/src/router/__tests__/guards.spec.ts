import { describe, expect, it } from 'vitest'
import type { RouteMeta } from 'vue-router'
import { resolveAccess, type AccessContext } from '../guards'

const route = (meta: RouteMeta = {}) => ({ meta, fullPath: '/target', name: 'target' })
const anonymous: AccessContext = { isAuthenticated: false, isVerified: false, isAdmin: false }
const unverified: AccessContext = { isAuthenticated: true, isVerified: false, isAdmin: false }
const coach: AccessContext = { isAuthenticated: true, isVerified: true, isAdmin: false }
const admin: AccessContext = { isAuthenticated: true, isVerified: true, isAdmin: true }

describe('resolveAccess', () => {
  it('allows public routes for everyone', () => {
    expect(resolveAccess(route({ public: true }), anonymous)).toBe(true)
    expect(resolveAccess(route({ public: true }), unverified)).toBe(true)
  })

  it('sends anonymous users to login with a redirect', () => {
    expect(resolveAccess(route(), anonymous)).toEqual({
      name: 'login',
      query: { redirect: '/target' },
    })
  })

  it('M1-02: sends unverified users to the verification page', () => {
    expect(resolveAccess(route(), unverified)).toEqual({ name: 'verify-email' })
  })

  it('keeps signed-in users away from login and registration', () => {
    expect(resolveAccess(route({ public: true, guestOnly: true }), coach)).toEqual({
      name: 'dashboard',
    })
  })

  it('restricts admin routes to admins', () => {
    expect(resolveAccess(route({ requiresAdmin: true }), coach)).toEqual({ name: 'forbidden' })
    expect(resolveAccess(route({ requiresAdmin: true }), admin)).toBe(true)
  })
})
