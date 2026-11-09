import { mount, flushPromises, type ComponentMountingOptions } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type RouteRecordRaw } from 'vue-router'
import type { Component } from 'vue'
import { useSessionStore } from '@/shared/auth/session'
import type {
  CategoryRecord,
  EventRecord,
  Role,
  RoleAssignmentRecord,
  TeamRecord,
  UserRecord,
} from '@/shared/types/records'

export function makeUser(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: 'user1',
    collectionId: '_pb_users_auth_',
    collectionName: 'users',
    created: '',
    updated: '',
    email: 'coach@example.com',
    name: 'Coach',
    verified: true,
    avatar: '',
    ...overrides,
  }
}

export function makeRole(role: Role, event = ''): RoleAssignmentRecord {
  return {
    id: `${role}-${event}`,
    collectionId: 'ra',
    collectionName: 'role_assignments',
    created: '',
    updated: '',
    user: 'user1',
    role,
    event,
  }
}

/**
 * Mounts a component with a fresh Pinia store and an in-memory router.
 * `session` pre-populates the session store without touching PocketBase.
 */
export async function mountView<C extends Component>(
  component: C,
  options: {
    props?: ComponentMountingOptions<C>['props']
    session?: { user?: UserRecord | null; roles?: RoleAssignmentRecord[] }
    routes?: RouteRecordRaw[]
    path?: string
    /** Runs before mounting, e.g. to spy on session actions used in onMounted. */
    setup?: (session: ReturnType<typeof useSessionStore>) => void
  } = {},
) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const session = useSessionStore()
  session.user = options.session?.user === undefined ? makeUser() : options.session.user
  session.roles = options.session?.roles ?? []
  options.setup?.(session)

  const stub = { template: '<div />' }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: options.routes ?? [{ path: '/:any(.*)*', name: 'any', component: stub }],
  })
  // Named routes used by RouterLinks in views.
  for (const name of [
    'dashboard',
    'login',
    'event',
    'team',
    'team-new',
    'my-teams',
    'verify-email',
    'events',
    'category-scoring',
    'category-library',
  ]) {
    if (!router.hasRoute(name))
      router.addRoute({ path: `/__${name}/:id?/:eventId?`, name, component: stub })
  }
  await router.push(options.path ?? '/')
  await router.isReady()

  const wrapper = mount(component, {
    props: options.props as never,
    global: { plugins: [pinia, router] },
    attachTo: document.body,
  })
  await flushPromises()
  return { wrapper, router, session }
}

const base = (id: string, collectionName: string) => ({
  id,
  collectionId: collectionName,
  collectionName,
  created: '2026-01-01 00:00:00.000Z',
  updated: '2026-01-01 00:00:00.000Z',
})

export function makeEvent(overrides: Partial<EventRecord> = {}): EventRecord {
  return {
    ...base('event1', 'events'),
    name: 'WRO Final',
    season: 2026,
    venue: 'Bern',
    description: '',
    status: 'published',
    registration_opens_at: '',
    registration_closes_at: '',
    ...overrides,
  }
}

export function makeCategory(overrides: Partial<CategoryRecord> = {}): CategoryRecord {
  return {
    ...base('cat1', 'categories'),
    event: 'event1',
    name: 'RoboMission Junior',
    code: 'RM-J',
    description: '',
    min_age: 11,
    max_age: 15,
    min_team_size: 2,
    max_team_size: 3,
    max_teams: 0,
    settings: null,
    source: '',
    ...overrides,
  }
}

export function makeTeam(overrides: Partial<TeamRecord> = {}): TeamRecord {
  return {
    ...base('team1', 'teams'),
    event: 'event1',
    category: 'cat1',
    name: 'Robo Rangers',
    organization: 'School',
    country: 'CH',
    coach: 'user1',
    coach_name: 'Coach',
    coach_email: 'coach@example.com',
    members: [
      { first_name: 'Ada', last_name: 'Lovelace', birth_year: 2013 },
      { first_name: 'Alan', last_name: 'Turing', birth_year: 2013 },
    ],
    status: 'draft',
    review_note: '',
    submitted_at: '',
    reviewed_at: '',
    reviewed_by: '',
    ...overrides,
  }
}

/** Dialogs render into a portal on document.body. */
export function body() {
  return document.body
}

export async function fill(selector: string, value: string) {
  const el = document.querySelector<HTMLInputElement>(selector)
  if (!el) throw new Error(`No element ${selector}`)
  el.value = value
  el.dispatchEvent(new Event('input'))
  el.dispatchEvent(new Event('change'))
  await flushPromises()
}

export function buttonByText(text: string, root: ParentNode = document.body) {
  const button = [...root.querySelectorAll('button')].find((b) =>
    b.textContent?.trim().includes(text),
  )
  if (!button) throw new Error(`No button "${text}"`)
  return button
}

export async function click(el: HTMLElement) {
  el.click()
  await flushPromises()
}
