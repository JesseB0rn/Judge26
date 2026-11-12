import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { isLocale, locale, setLocale, type Locale } from '@/i18n'
import { pb } from '@/shared/api/pocketbase'
import type { Role, RoleAssignmentRecord, UserRecord } from '@/shared/types/records'
import * as viewAsApi from './viewAs'
import type { ViewAsRole, ViewSession } from './viewAs'

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
  /** Set while an admin views the app as another role (M8-C). */
  const viewAs = ref<ViewSession | null>(viewAsApi.storedViewAs()?.session ?? null)
  let initialization: Promise<void> | null = null

  pb.authStore.onChange(() => {
    user.value = pb.authStore.isValid ? (pb.authStore.record as UserRecord) : null
    if (!user.value) roles.value = []
  })

  const isAuthenticated = computed(() => user.value !== null)
  const isVerified = computed(() => user.value?.verified === true)
  const isAdmin = computed(() => roles.value.some((r) => r.role === 'admin'))
  /** Admins can switch to another role (M8-13); a switched session cannot switch again. */
  const canViewAs = computed(() => isAdmin.value && !viewAs.value)
  const isStaff = computed(() => roles.value.length > 0)
  /** Judges, head judges and event managers use the judging pages (M5). */
  const isJudge = computed(() =>
    roles.value.some(
      (r) => r.role === 'judge' || r.role === 'head_judge' || r.role === 'event_manager',
    ),
  )

  /** Head judges, event managers and admins review submitted score sheets (M5-11). */
  const canReview = computed(
    () =>
      isAdmin.value ||
      roles.value.some((r) => r.role === 'head_judge' || r.role === 'event_manager'),
  )
  /** Events whose score sheets this user reviews through an event role. */
  const reviewEvents = computed(() => {
    const seen = new Map<string, string>()
    for (const r of roles.value) {
      if (r.event && (r.role === 'head_judge' || r.role === 'event_manager')) {
        seen.set(r.event, r.expand?.event?.name ?? '')
      }
    }
    return [...seen].map(([id, name]) => ({ id, name }))
  })

  function rolesFor(eventId: string): Role[] {
    return roles.value.filter((r) => r.event === eventId).map((r) => r.role)
  }

  function canManageEvent(eventId: string) {
    return isAdmin.value || rolesFor(eventId).includes('event_manager')
  }

  function isEventStaff(eventId: string) {
    return isAdmin.value || rolesFor(eventId).length > 0
  }

  /**
   * The language follows the user: their saved choice applies when they sign in, and a user
   * without one gets the language they are using now. Emails are sent in it (backend).
   */
  async function syncLanguage() {
    if (!user.value || viewAs.value) return
    const saved = user.value.language
    if (isLocale(saved)) setLocale(saved)
    else await saveLanguage(locale.value)
  }

  async function saveLanguage(language: Locale) {
    if (!user.value || viewAs.value || user.value.language === language) return
    try {
      await pb.collection('users').update(user.value.id, { language })
    } catch {
      // Not critical: the language still applies on this device.
    }
  }

  /** Switches the UI language and, when signed in, saves it on the account. */
  async function setLanguage(language: Locale) {
    setLocale(language)
    await saveLanguage(language)
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
      if (viewAs.value) {
        // Switched tokens cannot be refreshed; an ended session returns to the admin.
        try {
          viewAs.value = await viewAsApi.currentViewAs()
          await loadRoles()
          return
        } catch {
          await stopViewAs()
          return
        }
      }
      try {
        await pb.collection('users').authRefresh()
        await loadRoles()
        await syncLanguage()
      } catch {
        pb.authStore.clear()
      }
    })()
    return initialization
  }

  async function refresh() {
    if (!viewAs.value) await pb.collection('users').authRefresh()
    await loadRoles()
  }

  /** Views the app as a role of an event, or as one person with it (M8-13, M8-16). */
  async function startViewAs(input: { event: string; role: ViewAsRole; user?: string }) {
    const saved = viewAsApi.storedViewAs()
    const admin = saved?.admin ?? { token: pb.authStore.token, record: pb.authStore.record! }
    const started = await viewAsApi.startViewAs(input)
    viewAsApi.storeViewAs({ admin, session: started.session })
    viewAs.value = started.session
    pb.authStore.save(started.token, started.record)
    await loadRoles()
    return started.session
  }

  /** Ends the switch and signs the admin back in (M8-15). */
  async function stopViewAs() {
    const saved = viewAsApi.storedViewAs()
    try {
      if (viewAs.value) await viewAsApi.endViewAs()
    } catch {
      // Already ended or expired.
    }
    viewAsApi.storeViewAs(null)
    viewAs.value = null
    if (!saved) {
      pb.authStore.clear()
      return
    }
    pb.authStore.save(saved.admin.token, saved.admin.record)
    try {
      await pb.collection('users').authRefresh()
      await loadRoles()
    } catch {
      pb.authStore.clear()
    }
  }

  async function login(email: string, password: string) {
    await pb.collection('users').authWithPassword(email, password)
    await loadRoles()
    await syncLanguage()
  }

  function logout() {
    if (viewAs.value) void viewAsApi.endViewAs().catch(() => {})
    viewAsApi.storeViewAs(null)
    viewAs.value = null
    pb.authStore.clear()
  }

  async function register(data: { name: string; email: string; password: string }) {
    // The verification email is sent in the language the user registered in.
    await pb
      .collection('users')
      .create({ ...data, passwordConfirm: data.password, language: locale.value })
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
    canViewAs,
    viewAs,
    startViewAs,
    stopViewAs,
    isStaff,
    isJudge,
    canReview,
    reviewEvents,
    rolesFor,
    canManageEvent,
    isEventStaff,
    ensureInitialized,
    loadRoles,
    refresh,
    login,
    logout,
    register,
    setLanguage,
    requestVerification,
    confirmVerification,
    requestPasswordReset,
    confirmPasswordReset,
  }
})
