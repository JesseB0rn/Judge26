import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { pb } from '@/shared/api/pocketbase'
import type { Role, RoleAssignmentRecord, UserRecord } from '@/shared/types/records'

/**
 * Current user, their role assignments and authentication actions.
 * UI permission checks mirror the API rules for convenience only; the backend
 * enforces all access control.
 */
export const useSessionStore = defineStore('session', () => {
  const user = ref<UserRecord | null>(
    pb.authStore.isValid ? (pb.authStore.record as UserRecord) : null,
  )
  const roles = ref<RoleAssignmentRecord[]>([])
  let initialization: Promise<void> | null = null

  pb.authStore.onChange(() => {
    user.value = pb.authStore.isValid ? (pb.authStore.record as UserRecord) : null
    if (!user.value) roles.value = []
  })

  const isAuthenticated = computed(() => user.value !== null)
  const isVerified = computed(() => user.value?.verified === true)
  const isAdmin = computed(() => roles.value.some((r) => r.role === 'admin'))
  const isStaff = computed(() => roles.value.length > 0)
  /** Judges, head judges and event managers use the judging pages (M5). */
  const isJudge = computed(() =>
    roles.value.some(
      (r) => r.role === 'judge' || r.role === 'head_judge' || r.role === 'event_manager',
    ),
  )

  function rolesFor(eventId: string): Role[] {
    return roles.value.filter((r) => r.event === eventId).map((r) => r.role)
  }

  function canManageEvent(eventId: string) {
    return isAdmin.value || rolesFor(eventId).includes('event_manager')
  }

  function isEventStaff(eventId: string) {
    return isAdmin.value || rolesFor(eventId).length > 0
  }

  async function loadRoles() {
    if (!user.value?.verified) {
      roles.value = []
      return
    }
    roles.value = await pb.collection('role_assignments').getFullList<RoleAssignmentRecord>({
      filter: pb.filter('user = {:user}', { user: user.value.id }),
      expand: 'event',
    })
  }

  /** Refreshes the stored session once per page load. */
  function ensureInitialized() {
    initialization ??= (async () => {
      if (!pb.authStore.isValid) return
      try {
        await pb.collection('users').authRefresh()
        await loadRoles()
      } catch {
        pb.authStore.clear()
      }
    })()
    return initialization
  }

  async function refresh() {
    await pb.collection('users').authRefresh()
    await loadRoles()
  }

  async function login(email: string, password: string) {
    await pb.collection('users').authWithPassword(email, password)
    await loadRoles()
  }

  function logout() {
    pb.authStore.clear()
  }

  async function register(data: { name: string; email: string; password: string }) {
    await pb.collection('users').create({ ...data, passwordConfirm: data.password })
    await pb.collection('users').authWithPassword(data.email, data.password)
    await pb.collection('users').requestVerification(data.email)
  }

  async function requestVerification() {
    if (user.value) await pb.collection('users').requestVerification(user.value.email)
  }

  async function confirmVerification(token: string) {
    await pb.collection('users').confirmVerification(token)
    if (pb.authStore.isValid) await refresh()
  }

  async function requestPasswordReset(email: string) {
    await pb.collection('users').requestPasswordReset(email)
  }

  async function confirmPasswordReset(token: string, password: string) {
    await pb.collection('users').confirmPasswordReset(token, password, password)
  }

  return {
    user,
    roles,
    isAuthenticated,
    isVerified,
    isAdmin,
    isStaff,
    isJudge,
    rolesFor,
    canManageEvent,
    isEventStaff,
    ensureInitialized,
    loadRoles,
    refresh,
    login,
    logout,
    register,
    requestVerification,
    confirmVerification,
    requestPasswordReset,
    confirmPasswordReset,
  }
})
