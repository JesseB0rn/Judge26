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

/** Creates an approved team (2 members, age 13) in the category, optionally with a coach account. */
export async function createApprovedTeam(
  eventId: string,
  categoryId: string,
  name: string,
  coachId = '',
  coachEmail = 'coach@test.local',
) {
  const pb = await superuser()
  return pb.collection('teams').create({
    event: eventId,
    category: categoryId,
    name,
    coach: coachId,
    coach_email: coachEmail,
    status: 'approved',
    members: [
      { first_name: 'Ada', last_name: 'L', birth_year: 2013 },
      { first_name: 'Alan', last_name: 'T', birth_year: 2013 },
    ],
  })
}

/** Creates a round with the given testing and scoring durations. */
export async function createRound(
  categoryId: string,
  key: string,
  testingMinutes = 5,
  scoringMinutes = 10,
) {
  const pb = await superuser()
  return pb.collection('rounds').create({
    category: categoryId,
    key,
    name: `Round ${key.slice(1)}`,
    position: 1,
    testing_minutes: testingMinutes,
    scoring_minutes: scoringMinutes,
  })
}

/** Creates an unplaced game waiting to be scheduled. */
export async function createScheduledGame(roundId: string, teamId: string) {
  const pb = await superuser()
  return pb.collection('games').create({ round: roundId, team: teamId, status: 'scheduled' })
}

/** Publishes a ruleset for the category and returns it (M2). */
export async function publishRuleset(categoryId: string, definition: unknown) {
  const pb = await superuser()
  const draft = await pb
    .collection('rulesets')
    .create({ category: categoryId, definition, status: 'draft' })
  return pb.collection('rulesets').update(draft.id, { status: 'published' })
}

/** Sets the category's ranking configuration (M3). */
export async function setRanking(categoryId: string, ranking: unknown) {
  const pb = await superuser()
  return pb.collection('categories').update(categoryId, { ranking })
}

export async function createDay(eventId: string, date: string, label = '') {
  const pb = await superuser()
  return pb.collection('competition_days').create({ event: eventId, date, label })
}

/** Creates an active table with a fixed judge (M4). */
export async function createTable(eventId: string, name: string, judgeId: string) {
  const pb = await superuser()
  return pb.collection('tables').create({ event: eventId, name, active: true, judge: judgeId })
}

/** Creates a game placed on a table at the given sequence (M4). */
export async function createPlacedGame(
  roundId: string,
  teamId: string,
  tableId: string,
  sequence: number,
) {
  const pb = await superuser()
  return pb.collection('games').create({
    round: roundId,
    team: teamId,
    status: 'scheduled',
    table: tableId,
    sequence,
  })
}

/** Updates a round (e.g. to assign its competition day). */
export async function updateRound(roundId: string, data: Record<string, unknown>) {
  const pb = await superuser()
  return pb.collection('rounds').update(roundId, data)
}

/** The score sheet of a game, or null (M5). */
export async function getScoreSheet(gameId: string) {
  const pb = await superuser()
  const sheets = await pb
    .collection('score_sheets')
    .getFullList({ filter: pb.filter('game = {:game}', { game: gameId }) })
  return sheets[0] ?? null
}

/** Records a final result directly (as a manager would in the M3 result form). */
export async function recordResult(gameId: string, points: number, timeMs = 0) {
  const pb = await superuser()
  return pb.collection('games').update(gameId, { status: 'completed', points, time_ms: timeMs })
}

/** Sets the category's public results (M6-10). */
export async function setPublication(
  categoryId: string,
  data: { public_live?: boolean; published_snapshot?: string },
) {
  const pb = await superuser()
  return pb.collection('categories').update(categoryId, data)
}

/** Phases of a round by kind (M4-14: maintenance, check, scoring). */
export async function getRoundPhases(roundId: string): Promise<Record<string, RecordModel>> {
  const pb = await superuser()
  const list = await pb
    .collection('round_phases')
    .getFullList({ filter: pb.filter('round = {:round}', { round: roundId }) })
  return Object.fromEntries(list.map((p) => [p.phase as string, p]))
}

/** Places a round phase on a day at a time (M4-14). */
export async function placePhase(phaseId: string, day: string, startsAt: string) {
  const pb = await superuser()
  const phase = await pb.collection('round_phases').getOne(phaseId)
  return pb
    .collection('round_phases')
    .update(phaseId, { day, starts_at: startsAt, expected_updated: phase.updated })
}

/** Creates a custom schedule block (M4-14). */
export async function createBlock(eventId: string, data: Record<string, unknown>) {
  const pb = await superuser()
  return pb.collection('schedule_blocks').create({
    event: eventId,
    duration_minutes: 60,
    public: true,
    ...data,
  })
}

/** Creates a custom planner column (M4-14-33). */
export async function createColumn(
  eventId: string,
  name: string,
  data: Record<string, unknown> = {},
) {
  const pb = await superuser()
  return pb
    .collection('schedule_columns')
    .create({ event: eventId, name, position: 0, public: true, ...data })
}

/** Emails captured by the test backend for an address (apps/backend/hooks/mail.pb.js). */
export async function mailsTo(email: string): Promise<{ subject: string; html: string }[]> {
  const res = await fetch(`${API_URL}/api/dev/mails?to=${encodeURIComponent(email)}`)
  return (await res.json()) as { subject: string; html: string }[]
}

/** Runs the outbox delivery job now instead of waiting for its schedule (M7-01). */
export async function processOutbox() {
  const res = await fetch(`${API_URL}/api/dev/mail-outbox/process`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  })
  if (!res.ok) throw new Error(`Outbox processing failed: ${res.status} ${await res.text()}`)
  return (await res.json()) as { sent: number; pending: number; failed: number }
}
