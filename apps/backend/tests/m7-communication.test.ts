import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { RecordModel } from 'pocketbase'
import { startPocketBase, TEST_APP_URL, type TestServer } from './support/pocketbase'
import {
  expectDenied,
  expectFieldError,
  Fixtures,
  mailsTo,
  tokenFromMail,
  validMembers,
  type TestUser,
} from './support/fixtures'

// M7-01 – M7-04: transactional email (docs/specifications/M7-communication.md).

interface Outbox extends RecordModel {
  template: string
  to: string
  subject: string
  html: string
  status: 'pending' | 'sent' | 'failed'
  attempts: number
  last_error: string
  next_attempt_at: string
  sent_at: string
}

interface ScheduleTeam {
  team: { id: string; name: string }
  coach_email: string
  changed: boolean
  notified_at: string
  items: { round: string; table: string; sequence: number; text: string }[]
}

describe('M7 communication', () => {
  let server: TestServer
  let fx: Fixtures
  let admin: TestUser

  beforeAll(async () => {
    server = await startPocketBase()
    fx = await Fixtures.create(server)
    admin = await fx.admin()
  })
  afterAll(() => server?.dispose())

  const post = async (path: string, body: unknown = {}, token = '') => {
    const res = await fetch(`${server.url}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: token } : {}) },
      body: JSON.stringify(body),
    })
    return { status: res.status, body: (await res.json()) as Record<string, unknown> }
  }
  const processOutbox = (now = 0) =>
    post('/api/dev/mail-outbox/process', { now }) as Promise<{
      status: number
      body: { sent: number; pending: number; failed: number }
    }>
  const failNext = (count: number) => post('/api/dev/mail-failures', { count })
  const outboxFor = (to: string) =>
    fx.su.collection('mail_outbox').getFullList<Outbox>({ filter: `to = "${to}"`, sort: 'created' })
  const template = (key: string) =>
    fx.su.collection('mail_templates').getFirstListItem(`key = "${key}"`)

  let n = 0
  async function registration(eventData: Record<string, unknown> = {}) {
    const event = await fx.event(eventData)
    const category = await fx.category(event.id, { name: 'RoboMission Elementary' })
    const coach = await fx.user({ name: 'Grace Hopper' })
    const team = await coach.pb.collection('teams').create({
      event: event.id,
      category: category.id,
      name: `Byte Busters ${++n}`,
      coach: coach.id,
      status: 'draft',
      members: validMembers(),
    })
    return { event, category, coach, team }
  }

  describe('templates (M7-02)', () => {
    it('ships a template per notification; only admins read and edit them', async () => {
      const list = await admin.pb.collection('mail_templates').getFullList()
      expect(list.map((t) => t.key).sort()).toEqual([
        'registration_approved',
        'registration_rejected',
        'registration_submitted',
        'schedule_changed',
      ])
      expect(list.every((t) => t.enabled)).toBe(true)

      const manager = await fx.user({
        roles: [{ role: 'event_manager', event: (await fx.event()).id }],
      })
      expect(await manager.pb.collection('mail_templates').getFullList()).toHaveLength(0)
      await expectDenied(
        manager.pb.collection('mail_templates').update(list[0]!.id, { subject: 'Hi' }),
      )
      expect(await server.client().collection('mail_templates').getFullList()).toHaveLength(0)
    })

    it('templates cannot be created, deleted or re-keyed', async () => {
      const t = await template('registration_approved')
      await expectDenied(
        admin.pb
          .collection('mail_templates')
          .create({ key: 'x', name: 'x', subject: 'x', body: 'x' }),
      )
      await expectDenied(admin.pb.collection('mail_templates').delete(t.id))
      await expectDenied(
        admin.pb.collection('mail_templates').update(t.id, { key: 'registration_rejected' }),
      )
    })

    it('rejects variables a template does not provide', async () => {
      const t = await template('registration_submitted')
      const error = await expectFieldError(
        admin.pb.collection('mail_templates').update(t.id, { body: 'Hi {{password}}' }),
        'body',
        'unknown_variable',
      )
      expect(JSON.stringify(error.response)).toContain('team_name')
      await expectFieldError(
        admin.pb.collection('mail_templates').update(t.id, { subject: '{{schedule}}' }),
        'subject',
        'unknown_variable',
      )
    })

    it('exposes the variables of each template to admins', async () => {
      const vars = await admin.pb.send('/api/mail/templates/variables', {})
      expect(vars.schedule_changed).toContain('schedule')
      const user = await fx.user()
      await expectDenied(user.pb.send('/api/mail/templates/variables', {}))
    })

    it('an edited template is used for the next message; a disabled one sends nothing', async () => {
      const t = await template('registration_submitted')
      try {
        await admin.pb.collection('mail_templates').update(t.id, {
          subject: 'Thanks, {{coach_name}}',
          body: '<p>{{team_name}} / {{category_name}} / {{event_name}}</p>',
        })
        const a = await registration({ name: 'Swiss Open' })
        await a.coach.pb.collection('teams').update(a.team.id, { status: 'submitted' })
        const [mail] = await mailsTo(server, a.coach.email)
        expect(mail!.subject).toBe('Thanks, Grace Hopper')
        expect(mail!.html).toBe(`<p>${a.team.name} / RoboMission Elementary / Swiss Open</p>`)

        await admin.pb.collection('mail_templates').update(t.id, { enabled: false })
        const b = await registration()
        await b.coach.pb.collection('teams').update(b.team.id, { status: 'submitted' })
        expect(await mailsTo(server, b.coach.email)).toHaveLength(0)
        expect(await outboxFor(b.coach.email)).toHaveLength(0)
      } finally {
        await fx.su
          .collection('mail_templates')
          .update(t.id, { subject: t.subject, body: t.body, enabled: true })
      }
    })
  })

  describe('registration notifications (M7-03)', () => {
    it('M7-T01: submitting a registration delivers a confirmation email', async () => {
      const { coach, team } = await registration()
      expect(await mailsTo(server, coach.email)).toHaveLength(0) // drafts send nothing

      await coach.pb.collection('teams').update(team.id, { status: 'submitted' })
      const mails = await mailsTo(server, coach.email)
      expect(mails).toHaveLength(1)
      expect(mails[0]!.subject).toBe(`Registration received: ${team.name}`)
      expect(mails[0]!.html).toContain('Hello Grace Hopper')
      expect(mails[0]!.html).toContain(`href="${TEST_APP_URL}/teams/${team.id}"`)

      const [entry] = await outboxFor(coach.email)
      expect(entry).toMatchObject({
        template: 'registration_submitted',
        status: 'sent',
        attempts: 1,
        team: team.id,
      })
      expect(entry!.sent_at).toBeTruthy()

      // Saving again without a status change sends nothing.
      await fx.su.collection('teams').update(team.id, { name: `${team.name} 2` })
      expect(await mailsTo(server, coach.email)).toHaveLength(1)
    })

    it('approval and rejection notify the coach, with the reason', async () => {
      const { event, coach, team } = await registration()
      const manager = await fx.user({ roles: [{ role: 'event_manager', event: event.id }] })
      await coach.pb.collection('teams').update(team.id, { status: 'submitted' })
      await manager.pb
        .collection('teams')
        .update(team.id, { status: 'rejected', review_note: 'Birth year of member 2 missing <b>' })
      await coach.pb.collection('teams').update(team.id, { status: 'submitted' })
      await manager.pb.collection('teams').update(team.id, { status: 'approved', review_note: '' })

      const mails = await mailsTo(server, coach.email)
      expect(mails.map((m) => m.subject)).toEqual([
        `Registration received: ${team.name}`,
        `Registration not accepted: ${team.name}`,
        `Registration received: ${team.name}`,
        `Registration approved: ${team.name}`,
      ])
      // Values are escaped in the body.
      expect(mails[1]!.html).toContain('Reason: Birth year of member 2 missing &lt;b&gt;')
    })

    it('escapes team data in the body and keeps the subject on one line', async () => {
      const event = await fx.event()
      const category = await fx.category(event.id)
      const email = `escape-${Date.now()}@test.local`
      await fx.team(event.id, category.id, {
        name: '<img src=x onerror=alert(1)>\nX',
        coach_email: email,
        status: 'submitted',
      })
      const [mail] = await mailsTo(server, email)
      expect(mail!.html).toContain('&lt;img src=x onerror=alert(1)&gt;')
      expect(mail!.html).not.toContain('<img')
      expect(mail!.subject).not.toContain('\n')
    })

    it('M7-T02: a password reset email is delivered', async () => {
      const user = await fx.user()
      await server.client().collection('users').requestPasswordReset(user.email)
      const { url } = await tokenFromMail(server, user.email, '/auth/reset-password')
      expect(url.startsWith(`${TEST_APP_URL}/auth/reset-password?token=`)).toBe(true)
    })
  })

  describe('delivery and retries (M7-01)', () => {
    it('M7-T12: a provider failure is recorded and retried with backoff', async () => {
      const { coach, team } = await registration()
      await failNext(1)
      await coach.pb.collection('teams').update(team.id, { status: 'submitted' })

      let [entry] = await outboxFor(coach.email)
      expect(entry).toMatchObject({ status: 'pending', attempts: 1 })
      expect(entry!.last_error).toContain('Simulated mail provider failure')
      const delay = Date.parse(entry!.next_attempt_at) - Date.parse(entry!.updated)
      expect(delay).toBeGreaterThan(50_000) // first retry after a minute
      expect(await mailsTo(server, coach.email)).toHaveLength(0)

      // Not due yet: the job leaves it alone.
      await processOutbox()
      expect((await outboxFor(coach.email))[0]!.attempts).toBe(1)

      // A minute later the job sends it.
      await processOutbox(Date.now() + 2 * 60_000)
      ;[entry] = await outboxFor(coach.email)
      expect(entry).toMatchObject({ status: 'sent', attempts: 2, last_error: '' })
      expect(await mailsTo(server, coach.email)).toHaveLength(1)
    })

    it('gives up after five attempts; admins and the event manager can retry', async () => {
      const { event, coach, team } = await registration()
      await failNext(5)
      await coach.pb.collection('teams').update(team.id, { status: 'submitted' })
      for (const minutes of [2, 10, 30, 120]) await processOutbox(Date.now() + minutes * 60_000)

      let [entry] = await outboxFor(coach.email)
      expect(entry).toMatchObject({ status: 'failed', attempts: 5 })
      expect(await mailsTo(server, coach.email)).toHaveLength(0)
      await processOutbox(Date.now() + 24 * 60 * 60_000)
      expect((await outboxFor(coach.email))[0]!.status).toBe('failed')

      // Managers of the event see the message; other users do not.
      const manager = await fx.user({ roles: [{ role: 'event_manager', event: event.id }] })
      const other = await fx.user({
        roles: [{ role: 'event_manager', event: (await fx.event()).id }],
      })
      expect(await manager.pb.collection('mail_outbox').getFullList()).toHaveLength(1)
      expect(await other.pb.collection('mail_outbox').getFullList()).toHaveLength(0)
      expect(await coach.pb.collection('mail_outbox').getFullList()).toHaveLength(0)
      await expectDenied(other.pb.send(`/api/mail/outbox/${entry!.id}/retry`, { method: 'POST' }))
      await expectDenied(coach.pb.send(`/api/mail/outbox/${entry!.id}/retry`, { method: 'POST' }))

      const retried = await manager.pb.send(`/api/mail/outbox/${entry!.id}/retry`, {
        method: 'POST',
      })
      expect(retried).toMatchObject({ status: 'sent', attempts: 1 })
      expect(await mailsTo(server, coach.email)).toHaveLength(1)
      await expectDenied(admin.pb.send(`/api/mail/outbox/${entry!.id}/retry`, { method: 'POST' }))
      ;[entry] = await outboxFor(coach.email)
      expect(entry!.status).toBe('sent')
    })

    it('the outbox cannot be written through the API', async () => {
      const { coach, team } = await registration()
      await coach.pb.collection('teams').update(team.id, { status: 'submitted' })
      const [entry] = await outboxFor(coach.email)
      await expectDenied(
        admin.pb
          .collection('mail_outbox')
          .create({ to: 'x@test.local', subject: 'x', status: 'pending' }),
      )
      await expectDenied(
        admin.pb.collection('mail_outbox').update(entry!.id, { status: 'pending' }),
      )
      await expectDenied(admin.pb.collection('mail_outbox').delete(entry!.id))
    })
  })

  describe('schedule notifications (M7-04)', () => {
    async function scheduled() {
      const event = await fx.event({ name: 'National Final' })
      const category = await fx.category(event.id)
      const manager = await fx.user({ roles: [{ role: 'event_manager', event: event.id }] })
      const judge = await fx.user({ roles: [{ role: 'judge', event: event.id }] })
      const round = await manager.pb.collection('rounds').create({
        category: category.id,
        key: 'R1',
        name: 'Round 1',
        position: 1,
        testing_minutes: 30,
        scoring_minutes: 60,
      })
      const table = async (name: string, position: number) =>
        manager.pb
          .collection('tables')
          .create({ event: event.id, name, active: true, position, judge: judge.id })
      const tableA = await table('A', 1)
      const tableB = await table('B', 2)
      const teams: RecordModel[] = []
      const games: RecordModel[] = []
      for (const i of [1, 2, 3]) {
        const team = await fx.team(event.id, category.id, {
          name: `Team ${i}`,
          coach_email: `sched-${event.id}-${i}@test.local`,
          coach_name: `Coach ${i}`,
          status: i === 3 ? 'submitted' : 'approved',
        })
        teams.push(team)
        if (i === 3) continue // pending registrations have no games
        games.push(
          await manager.pb.collection('games').create({
            round: round.id,
            team: team.id,
            status: 'scheduled',
            table: tableA.id,
            sequence: i,
          }),
        )
      }
      const day = await fx.su
        .collection('competition_days')
        .create({ event: event.id, date: '2026-06-01', label: 'Saturday' })
      const scoring = await manager.pb
        .collection('round_phases')
        .getFirstListItem(`round = "${round.id}" && phase = "scoring"`)
      await manager.pb
        .collection('round_phases')
        .update(scoring.id, { day: day.id, starts_at: '10:00', expected_updated: scoring.updated })
      return { event, manager, judge, teams, games, tableB }
    }

    const preview = (user: TestUser, eventId: string) =>
      user.pb.send(`/api/events/${eventId}/notifications/schedule`, {}) as Promise<{
        teams: ScheduleTeam[]
        changed: number
      }>
    const notify = (user: TestUser, eventId: string, body: Record<string, unknown> = {}) =>
      user.pb.send(`/api/events/${eventId}/notifications/schedule`, {
        method: 'POST',
        body,
      }) as Promise<{ queued: number }>
    const scheduleMails = async (email: string) =>
      (await mailsTo(server, email)).filter((m) => m.subject.startsWith('Schedule for'))

    it('M7-T03: changing the schedule notifies the affected participants only', async () => {
      const ctx = await scheduled()
      const [t1, t2, t3] = ctx.teams

      // Before any notice, every approved team with games is affected; pending registrations are not.
      let state = await preview(ctx.manager, ctx.event.id)
      expect(state.teams.map((t) => t.team.name)).toEqual(['Team 1', 'Team 2'])
      expect(state.changed).toBe(2)
      expect(state.teams[0]!.items[0]!.text).toBe(
        'Round 1 · Saturday · from 10:00 · table A, position 1',
      )

      expect(await notify(ctx.manager, ctx.event.id, { message: 'Doors open at 8:00.' })).toEqual({
        queued: 2,
      })
      // Bulk notifications are delivered by the job.
      expect(await scheduleMails(t1!.coach_email)).toHaveLength(0)
      await processOutbox()
      const [mail] = await scheduleMails(t1!.coach_email)
      expect(mail!.subject).toBe('Schedule for Team 1 at National Final')
      expect(mail!.html).toContain('<li>Round 1 · Saturday · from 10:00 · table A, position 1</li>')
      expect(mail!.html).toContain('Doors open at 8:00.')
      expect(mail!.html).toContain(`${TEST_APP_URL}/live/${ctx.event.id}`)
      expect(await scheduleMails(t2!.coach_email)).toHaveLength(1)
      expect(await scheduleMails(t3!.coach_email)).toHaveLength(0)

      state = await preview(ctx.manager, ctx.event.id)
      expect(state.changed).toBe(0)
      expect(state.teams.every((t) => t.notified_at)).toBe(true)
      expect(await notify(ctx.manager, ctx.event.id)).toEqual({ queued: 0 })

      // Team 2 moves to table B: only Team 2 is affected.
      const game2 = await ctx.manager.pb.collection('games').getOne(ctx.games[1]!.id)
      await ctx.manager.pb
        .collection('games')
        .update(game2.id, { table: ctx.tableB.id, sequence: 1, expected_updated: game2.updated })
      state = await preview(ctx.manager, ctx.event.id)
      expect(state.teams.filter((t) => t.changed).map((t) => t.team.name)).toEqual(['Team 2'])

      expect(await notify(ctx.manager, ctx.event.id)).toEqual({ queued: 1 })
      await processOutbox()
      expect(await scheduleMails(t1!.coach_email)).toHaveLength(1)
      const mails2 = await scheduleMails(t2!.coach_email)
      expect(mails2).toHaveLength(2)
      expect(mails2[1]!.html).toContain('table B, position 1')

      // "all" re-sends the current schedule to every team that has one.
      expect(await notify(ctx.manager, ctx.event.id, { scope: 'all' })).toEqual({ queued: 2 })
    })

    it('a team whose games were removed is told so', async () => {
      const ctx = await scheduled()
      await notify(ctx.manager, ctx.event.id)
      await fx.su.collection('games').delete(ctx.games[0]!.id)
      const state = await preview(ctx.manager, ctx.event.id)
      expect(state.teams.filter((t) => t.changed).map((t) => t.team.name)).toEqual(['Team 1'])
      await notify(ctx.manager, ctx.event.id)
      await processOutbox()
      const mails = await scheduleMails(ctx.teams[0]!.coach_email)
      expect(mails[1]!.html).toContain('No games are currently scheduled')
    })

    it('only event managers and admins can preview and notify', async () => {
      const ctx = await scheduled()
      const coach = await fx.user()
      await expectDenied(preview(ctx.judge, ctx.event.id))
      await expectDenied(notify(ctx.judge, ctx.event.id))
      await expectDenied(notify(coach, ctx.event.id))
      await expectDenied(
        server.client().send(`/api/events/${ctx.event.id}/notifications/schedule`, {}),
      )
      expect((await preview(admin, ctx.event.id)).changed).toBe(2)
      await expectFieldError(notify(ctx.manager, ctx.event.id, { scope: 'everyone' }), 'scope')
    })

    it('archived events cannot send notifications', async () => {
      const ctx = await scheduled()
      await fx.su.collection('events').update(ctx.event.id, { status: 'archived' })
      await expectDenied(notify(ctx.manager, ctx.event.id))
    })
  })
})
