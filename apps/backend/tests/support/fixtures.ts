import PocketBase, { ClientResponseError, type RecordModel } from 'pocketbase'
import { expect } from 'vitest'
import type { TestServer } from './pocketbase'

export type Role = 'admin' | 'event_manager' | 'head_judge' | 'judge'
export const PASSWORD = 'password-1234'

let counter = 0
const unique = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${++counter}`

export interface TestUser {
  id: string
  email: string
  pb: PocketBase
}

/** Fixture builder backed by a superuser client. */
export class Fixtures {
  constructor(
    readonly server: TestServer,
    readonly su: PocketBase,
  ) {}

  static async create(server: TestServer) {
    return new Fixtures(server, await server.superuserClient())
  }

  async user(
    options: { verified?: boolean; name?: string; roles?: { role: Role; event?: string }[] } = {},
  ): Promise<TestUser> {
    const email = `${unique('user')}@test.local`
    const record = await this.su.collection('users').create({
      email,
      password: PASSWORD,
      passwordConfirm: PASSWORD,
      name: options.name ?? email.split('@')[0],
      verified: options.verified ?? true,
    })
    for (const { role, event } of options.roles ?? []) {
      await this.su
        .collection('role_assignments')
        .create({ user: record.id, role, event: event ?? '' })
    }
    const pb = this.server.client()
    await pb.collection('users').authWithPassword(email, PASSWORD)
    return { id: record.id, email, pb }
  }

  admin() {
    return this.user({ roles: [{ role: 'admin' }] })
  }

  event(data: Record<string, unknown> = {}): Promise<RecordModel> {
    return this.su.collection('events').create({
      name: unique('Event'),
      season: 2026,
      status: 'published',
      ...data,
    })
  }

  category(event: string, data: Record<string, unknown> = {}): Promise<RecordModel> {
    return this.su.collection('categories').create({
      event,
      name: 'RoboMission Junior',
      code: unique('RM'),
      min_team_size: 2,
      max_team_size: 3,
      min_age: 11,
      max_age: 15,
      ...data,
    })
  }

  team(event: string, category: string, data: Record<string, unknown> = {}): Promise<RecordModel> {
    return this.su.collection('teams').create({
      event,
      category,
      name: unique('Team'),
      coach_email: 'contact@test.local',
      status: 'draft',
      members: validMembers(),
      ...data,
    })
  }

  /**
   * An active team with one scheduled game and a contact, in a new event with a manager.
   * `notify()` sends the event's schedule emails (M7-04), which queues one email to the contact.
   */
  async scheduledTeam(data: Record<string, unknown> = {}, eventData: Record<string, unknown> = {}) {
    const event = await this.event(eventData)
    const category = await this.category(event.id, { name: 'RoboMission Elementary' })
    const manager = await this.user({ roles: [{ role: 'event_manager', event: event.id }] })
    const judge = await this.user({ roles: [{ role: 'judge', event: event.id }] })
    const round = await manager.pb.collection('rounds').create({
      category: category.id,
      key: 'R1',
      name: 'Round 1',
      position: 1,
      testing_minutes: 30,
      scoring_minutes: 60,
    })
    const table = await manager.pb
      .collection('tables')
      .create({ event: event.id, name: 'A', active: true, position: 1, judges: [judge.id] })
    const team = await this.team(event.id, category.id, {
      coach_email: `${unique('contact')}@test.local`,
      status: 'approved',
      ...data,
    })
    await manager.pb
      .collection('games')
      .create({ round: round.id, team: team.id, status: 'scheduled', table: table.id, sequence: 1 })
    const notify = () =>
      manager.pb.send(`/api/events/${event.id}/notifications/schedule`, {
        method: 'POST',
        body: {},
      }) as Promise<{ queued: number }>
    return { event, category, manager, team, email: team.coach_email as string, notify }
  }
}

/** Two members aged 13 in season 2026. */
export function validMembers() {
  return [
    { first_name: 'Ada', last_name: 'Lovelace', birth_year: 2013 },
    { first_name: 'Alan', last_name: 'Turing', birth_year: 2013 },
  ]
}

/** Asserts that a request is rejected by access rules (PocketBase uses 400/403/404). */
export async function expectDenied(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  )
  expect(error, 'expected the request to be denied').toBeInstanceOf(ClientResponseError)
  expect([400, 401, 403, 404]).toContain((error as ClientResponseError).status)
  return error as ClientResponseError
}

/** Asserts a 400 validation error on the given field. */
export async function expectFieldError(promise: Promise<unknown>, field: string, code?: string) {
  const error = await expectDenied(promise)
  expect(error.status).toBe(400)
  const data = error.response?.data as Record<string, { code: string }> | undefined
  expect(Object.keys(data ?? {}), JSON.stringify(error.response)).toContain(field)
  if (code) expect(data?.[field]?.code).toBe(code)
  return error
}

export interface CapturedMail {
  to: string[]
  subject: string
  html: string
}

export async function mailsTo(server: TestServer, email: string): Promise<CapturedMail[]> {
  const res = await fetch(`${server.url}/api/dev/mails?to=${encodeURIComponent(email)}`)
  return (await res.json()) as CapturedMail[]
}

/**
 * Extracts the token from the latest captured mail's action link with the given path.
 * PocketBase sends mails asynchronously, so this polls briefly.
 */
export async function tokenFromMail(server: TestServer, email: string, path: string) {
  const pattern = new RegExp(`href="([^"]*${path}\\?token=([^"]+))"`)
  const deadline = Date.now() + 3000
  while (Date.now() < deadline) {
    const mails = await mailsTo(server, email)
    const match = [...mails]
      .reverse()
      .map((m) => pattern.exec(m.html))
      .find(Boolean)
    if (match) return { url: match[1]!, token: match[2]! }
    await new Promise((r) => setTimeout(r, 50))
  }
  throw new Error(`No ${path} link in mail to ${email}`)
}
