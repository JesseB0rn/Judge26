import PocketBase, { type RecordModel } from 'pocketbase'

// Must match playwright.config.ts (webServer) and apps/web/.env.test.
export const API_URL = 'http://127.0.0.1:8091'
export const SUPERUSER = { email: 'e2e-superuser@test.local', password: 'e2e-superuser-password' }
export const PASSWORD = 'e2e-password-123'

let counter = 0
export const unique = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${process.pid}-${++counter}`

async function superuser() {
  const pb = new PocketBase(API_URL)
  pb.autoCancellation(false)
  await pb.collection('_superusers').authWithPassword(SUPERUSER.email, SUPERUSER.password)
  return pb
}

export interface SeededUser {
  id: string
  email: string
  password: string
  name: string
}

export async function createUser(
  options: { name?: string; roles?: { role: string; event?: string }[]; verified?: boolean } = {},
): Promise<SeededUser> {
  const pb = await superuser()
  const email = `${unique('user')}@test.local`
  const name = options.name ?? 'Test User'
  const user = await pb.collection('users').create({
    email,
    name,
    password: PASSWORD,
    passwordConfirm: PASSWORD,
    verified: options.verified ?? true,
  })
  for (const { role, event = '' } of options.roles ?? []) {
    await pb.collection('role_assignments').create({ user: user.id, role, event })
  }
  return { id: user.id, email, password: PASSWORD, name }
}

/** Creates a published event with one category (RM-J: 2–3 members, age 11–15). */
export async function createEvent(
  data: Record<string, unknown> = {},
): Promise<{ event: RecordModel; category: RecordModel }> {
  const pb = await superuser()
  const event = await pb.collection('events').create({
    name: unique('E2E Event'),
    season: 2026,
    status: 'published',
    ...data,
  })
  const category = await pb.collection('categories').create({
    event: event.id,
    name: 'RoboMission Junior',
    code: 'RM-J',
    min_team_size: 2,
    max_team_size: 3,
    min_age: 11,
    max_age: 15,
  })
  return { event, category }
}

export async function getTeamByName(name: string) {
  const pb = await superuser()
  return pb.collection('teams').getFirstListItem(pb.filter('name = {:name}', { name }))
}

/** Latest action link (e.g. /auth/verify-email) from mails captured by the test backend. */
export async function linkFromMail(email: string, path: string): Promise<string> {
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    const res = await fetch(`${API_URL}/api/dev/mails?to=${encodeURIComponent(email)}`)
    const mails = (await res.json()) as { html: string }[]
    for (const mail of mails.reverse()) {
      const match = new RegExp(`href="([^"]*${path}\\?token=[^"]+)"`).exec(mail.html)
      if (match) return match[1]!
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(`No ${path} mail for ${email}`)
}

/** Creates an approved team (2 members, age 13) in the category. */
export async function createApprovedTeam(eventId: string, categoryId: string, name: string) {
  const pb = await superuser()
  return pb.collection('teams').create({
    event: eventId,
    category: categoryId,
    name,
    coach_email: 'coach@test.local',
    status: 'approved',
    members: [
      { first_name: 'Ada', last_name: 'L', birth_year: 2013 },
      { first_name: 'Alan', last_name: 'T', birth_year: 2013 },
    ],
  })
}
