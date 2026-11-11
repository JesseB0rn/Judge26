import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import PocketBase, { ClientResponseError, type CollectionModel, type RecordModel } from 'pocketbase'
import { hooksDir } from '../scripts/paths.mjs'
import { startPocketBase, type TestServer } from './support/pocketbase'
import { expectDenied, Fixtures, validMembers, type TestUser } from './support/fixtures'

// M7-11 security testing, M7-T09 unauthorized API requests and M7-T10 concurrent score
// submissions (docs/specifications/M7-audit-backup-security.md).

const AUTH = '@request.auth.id != "" && @request.auth.verified = true'
const RULES = ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule'] as const

/** Rules that are deliberately not "verified users only". Anything else must start with AUTH. */
const EXCEPTIONS: Record<string, string> = {
  // Registration (M1-01); the email must still be verified before anything is visible.
  'users.createRule': '',
  // The own account, or admins.
  'users.listRule':
    'id = @request.auth.id || (@request.auth.id != "" && @request.auth.verified = true && (@request.auth.role_assignments_via_user.user ?= @request.auth.id && @request.auth.role_assignments_via_user.role ?= "admin"))',
  'users.viewRule':
    'id = @request.auth.id || (@request.auth.id != "" && @request.auth.verified = true && (@request.auth.role_assignments_via_user.user ?= @request.auth.id && @request.auth.role_assignments_via_user.role ?= "admin"))',
  // Only the own account.
  'users.updateRule': 'id = @request.auth.id',
  'users.deleteRule': 'id = @request.auth.id',
  // A bare change counter for public displays (M6, ADR 0007).
  'live_revisions.listRule':
    '(event.status = "published" || event.status = "archived") || @request.auth.id != ""',
  'live_revisions.viewRule':
    '(event.status = "published" || event.status = "archived") || @request.auth.id != ""',
}

/** True if `rule` contains `||` outside parentheses and strings (which could bypass AUTH). */
function hasTopLevelOr(rule: string) {
  let depth = 0
  let quote = ''
  for (let i = 0; i < rule.length; i++) {
    const c = rule[i]!
    if (quote) {
      if (c === quote && rule[i - 1] !== '\\') quote = ''
    } else if (c === '"' || c === "'") quote = c
    else if (c === '(') depth++
    else if (c === ')') depth--
    else if (depth === 0 && c === '|' && rule[i + 1] === '|') return true
  }
  return false
}

/** Custom routes and who may call them. Must list every routerAdd in hooks/ (checked below). */
const ROUTES: { method: string; path: string; access: 'public' | 'dev' | 'auth' }[] = [
  { method: 'GET', path: '/api/app/info', access: 'public' },
  // Catch-all 404 for unknown API paths (M7-14).
  { method: 'GET', path: '/api/{path...}', access: 'public' },
  { method: 'GET', path: '/api/public/events', access: 'public' },
  { method: 'GET', path: '/api/public/events/{id}', access: 'public' },
  { method: 'GET', path: '/api/public/categories/{id}/ranking', access: 'public' },
  { method: 'GET', path: '/api/dev/mails', access: 'dev' },
  { method: 'POST', path: '/api/dev/mail-failures', access: 'dev' },
  { method: 'POST', path: '/api/dev/mail-outbox/process', access: 'dev' },
  // Monitoring (M7-13): the health status is public, details are for admins.
  { method: 'GET', path: '/api/app/health', access: 'public' },
  { method: 'POST', path: '/api/app/client-errors', access: 'public' },
  { method: 'GET', path: '/api/app/monitoring', access: 'auth' },
  { method: 'POST', path: '/api/dev/monitoring/run', access: 'dev' },
  { method: 'POST', path: '/api/dev/monitoring/error', access: 'dev' },
  { method: 'GET', path: '/api/dev/monitoring/crash', access: 'dev' },
  { method: 'POST', path: '/api/categories/{id}/copy', access: 'auth' },
  { method: 'GET', path: '/api/judging/assignments', access: 'auth' },
  { method: 'GET', path: '/api/events/{id}/judging', access: 'auth' },
  { method: 'GET', path: '/api/games/{id}/sheet', access: 'auth' },
  { method: 'PUT', path: '/api/games/{id}/sheet', access: 'auth' },
  { method: 'POST', path: '/api/games/{id}/sheet/{action}', access: 'auth' },
  { method: 'POST', path: '/api/mail/outbox/{id}/retry', access: 'auth' },
  { method: 'GET', path: '/api/mail/templates/variables', access: 'auth' },
  { method: 'GET', path: '/api/events/{id}/notifications/schedule', access: 'auth' },
  { method: 'POST', path: '/api/events/{id}/notifications/schedule', access: 'auth' },
  { method: 'GET', path: '/api/events/{id}/planner', access: 'auth' },
  { method: 'POST', path: '/api/categories/{id}/ranking/snapshots', access: 'auth' },
  { method: 'POST', path: '/api/role-assignments/by-email', access: 'auth' },
  { method: 'GET', path: '/api/admin/users', access: 'auth' },
  { method: 'POST', path: '/api/rulesets/{id}/evaluate', access: 'auth' },
  { method: 'POST', path: '/api/events/{id}/schedule/generate', access: 'auth' },
  { method: 'GET', path: '/api/events/{id}/schedule/validation', access: 'auth' },
  { method: 'GET', path: '/api/events/{id}/judges', access: 'auth' },
  { method: 'GET', path: '/api/users/{id}/schedule', access: 'auth' },
]

// Required: flag (10), blocks (5 each); parking exactly one of full (15) / partial (5).
const RULESET = {
  schemaVersion: 1,
  precision: 0,
  root: {
    id: 'total',
    label: 'Total',
    type: 'group',
    aggregate: 'sum',
    children: [
      { id: 'flag', label: 'Flag', type: 'boolean', points: 10, required: true },
      {
        id: 'blocks',
        label: 'Blocks',
        type: 'number',
        integer: true,
        min: 0,
        max: 6,
        pointsPerUnit: 5,
        required: true,
      },
      {
        id: 'parking',
        label: 'Parking',
        type: 'group',
        aggregate: 'sum',
        selection: { min: 1, max: 1 },
        children: [
          { id: 'full', label: 'Full', type: 'boolean', points: 15 },
          { id: 'partial', label: 'Partial', type: 'boolean', points: 5 },
        ],
      },
    ],
  },
}
const sheetValues = (blocks: number) => ({ flag: true, blocks, full: true })
const pointsFor = (blocks: number) => 25 + 5 * blocks

async function settle<T>(promises: Promise<T>[]) {
  const results = await Promise.allSettled(promises)
  const ok = results.filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<T>[]
  const failed = results
    .filter((r) => r.status === 'rejected')
    .map((r) => (r as PromiseRejectedResult).reason as ClientResponseError)
  return { ok, failed }
}

describe('M7 security', () => {
  let server: TestServer
  let fx: Fixtures

  beforeAll(async () => {
    server = await startPocketBase()
    fx = await Fixtures.create(server)
  })
  afterAll(() => server?.dispose())

  /** A draft event with one record in every event-scoped collection. */
  async function populated(status = 'draft') {
    const event = await fx.event({ status, name: 'Closed Event' })
    const category = await fx.category(event.id)
    const manager = await fx.user({ roles: [{ role: 'event_manager', event: event.id }] })
    const judge = await fx.user({ roles: [{ role: 'judge', event: event.id }] })
    const coach = await fx.user()
    const su = fx.su
    const day = await su
      .collection('competition_days')
      .create({ event: event.id, date: '2026-06-01', label: 'Day 1' })
    const round = await su.collection('rounds').create({
      category: category.id,
      key: 'R1',
      name: 'Round 1',
      position: 1,
      testing_minutes: 10,
      scoring_minutes: 10,
    })
    const draft = await su
      .collection('rulesets')
      .create({ category: category.id, definition: RULESET, status: 'draft' })
    const ruleset = await su.collection('rulesets').update(draft.id, { status: 'published' })
    const table = await su
      .collection('tables')
      .create({ event: event.id, name: 'A', active: true, judge: judge.id })
    const team = await su.collection('teams').create({
      event: event.id,
      category: category.id,
      name: 'Secret Team',
      coach: coach.id,
      coach_email: coach.email,
      status: 'approved',
      members: validMembers(),
    })
    const game = await su.collection('games').create({
      round: round.id,
      team: team.id,
      status: 'scheduled',
      table: table.id,
      sequence: 1,
    })
    await judge.pb.send(`/api/games/${game.id}/sheet/submit`, {
      method: 'POST',
      body: { values: sheetValues(2) },
    })
    const block = await su.collection('schedule_blocks').create({
      event: event.id,
      day: day.id,
      starts_at: '12:00',
      duration_minutes: 30,
      title: 'Lunch',
    })
    const document = await su.collection('team_documents').create({
      team: team.id,
      title: 'Robot description',
      file: new File(['secret'], 'robot.txt', { type: 'text/plain' }),
    })
    await su.collection('categories').update(category.id, {
      ranking: {
        schemaVersion: 1,
        rounds: [{ key: 'R1' }],
        ranking: { keys: [{ source: { round: 'R1' }, field: 'points', order: 'desc' }] },
      },
    })
    const snapshot = await manager.pb.send(`/api/categories/${category.id}/ranking/snapshots`, {
      method: 'POST',
      body: { title: 'Official' },
    })
    const sheet = await su.collection('score_sheets').getFirstListItem(`game = "${game.id}"`)
    const audit = await su.collection('score_audit').getFirstListItem(`game = "${game.id}"`)
    const log = await su.collection('audit_log').getFirstListItem(`event = "${event.id}"`)
    const mail = await su.collection('mail_outbox').getFirstListItem(`team = "${team.id}"`)
    const phase = await su.collection('round_phases').getFirstListItem(`round = "${round.id}"`)
    const roleRecord = await su
      .collection('role_assignments')
      .getFirstListItem(`event = "${event.id}" && user = "${judge.id}"`)
    const gameRule = await su
      .collection('game_rules')
      .getFirstListItem(`category = "${category.id}"`)
    const records: Record<string, string> = {
      events: event.id,
      categories: category.id,
      competition_days: day.id,
      rounds: round.id,
      rulesets: ruleset.id,
      game_rules: gameRule.id,
      round_phases: phase.id,
      tables: table.id,
      teams: team.id,
      games: game.id,
      score_sheets: sheet.id,
      score_audit: audit.id,
      schedule_blocks: block.id,
      team_documents: document.id,
      ranking_snapshots: snapshot.id,
      audit_log: log.id,
      mail_outbox: mail.id,
      role_assignments: roleRecord.id,
    }
    return { event, category, manager, judge, coach, team, game, round, records }
  }

  /** Users with no business in the event (M7-T09). */
  async function outsiders(): Promise<[string, PocketBase][]> {
    const other = await fx.event()
    const unverified = server.client()
    const u = await fx.user({ verified: false })
    await unverified.collection('users').authWithPassword(u.email, 'password-1234')
    const otherCoach = await fx.user()
    await fx.team(other.id, (await fx.category(other.id)).id, { coach: otherCoach.id })
    return [
      ['guest', server.client()],
      ['unverified user', unverified],
      ['verified user without roles', (await fx.user()).pb],
      ['coach of another event', otherCoach.pb],
      [
        'judge of another event',
        (await fx.user({ roles: [{ role: 'judge', event: other.id }] })).pb,
      ],
      [
        'head judge of another event',
        (await fx.user({ roles: [{ role: 'head_judge', event: other.id }] })).pb,
      ],
      [
        'manager of another event',
        (await fx.user({ roles: [{ role: 'event_manager', event: other.id }] })).pb,
      ],
    ]
  }

  describe('access rules (M7-11)', () => {
    it('every collection rule requires a verified user, except the documented ones', async () => {
      const collections = await fx.su.collections.getFullList<CollectionModel>()
      const violations: string[] = []
      for (const c of collections.filter((c) => !c.system)) {
        for (const ruleName of RULES) {
          const rule = (c as unknown as Record<string, string | null>)[ruleName] ?? null
          const key = `${c.name}.${ruleName}`
          if (key in EXCEPTIONS) {
            if (rule !== EXCEPTIONS[key]) violations.push(`${key} changed: ${rule}`)
            continue
          }
          if (rule === null) continue
          const rest = rule.slice(AUTH.length)
          if (!rule.startsWith(AUTH) || (rest && !rest.startsWith(' && ')) || hasTopLevelOr(rest)) {
            violations.push(`${key}: ${rule}`)
          }
        }
      }
      expect(violations).toEqual([])
    })

    it('internal collections are not accessible through the API at all', async () => {
      const collections = await fx.su.collections.getFullList<CollectionModel>()
      const closed = collections
        .filter(
          (c) =>
            !c.system && RULES.every((r) => (c as unknown as Record<string, unknown>)[r] === null),
        )
        .map((c) => c.name)
        .sort()
      expect(closed).toEqual(['app_settings', 'schedule_notices'])
    })

    it('M7-T09: outsiders can neither read nor change the records of an event', async () => {
      const ctx = await populated('draft')
      for (const [who, pb] of await outsiders()) {
        for (const [collection, id] of Object.entries(ctx.records)) {
          const label = `${who} → ${collection}`
          await expect(pb.collection(collection).getOne(id), label).rejects.toBeInstanceOf(
            ClientResponseError,
          )
          const list = await pb
            .collection(collection)
            .getFullList({ filter: `id = "${id}"` })
            .catch(() => [])
          expect(list, label).toEqual([])
          await expect(
            pb.collection(collection).update(id, { name: 'hacked', status: 'archived' }),
            label,
          ).rejects.toBeInstanceOf(ClientResponseError)
          await expect(pb.collection(collection).delete(id), label).rejects.toBeInstanceOf(
            ClientResponseError,
          )
        }
      }
      // Nothing changed.
      expect((await fx.su.collection('events').getOne(ctx.event.id)).status).toBe('draft')
      expect((await fx.su.collection('teams').getOne(ctx.team.id)).name).toBe('Secret Team')
    })

    it('in a published event, outsiders see the public program but no private data', async () => {
      const ctx = await populated('published')
      const restricted = [
        'teams',
        'games',
        'score_sheets',
        'score_audit',
        'team_documents',
        'audit_log',
        'mail_outbox',
        'role_assignments',
      ]
      for (const [who, pb] of (await outsiders()).slice(2)) {
        for (const collection of restricted) {
          await expect(
            pb.collection(collection).getOne(ctx.records[collection]!),
            `${who} → ${collection}`,
          ).rejects.toBeInstanceOf(ClientResponseError)
        }
        // The event itself is visible to verified users once published.
        expect((await pb.collection('events').getOne(ctx.event.id)).id).toBe(ctx.event.id)
      }
    })

    it('a coach sees the own team but not the scores or audit of it', async () => {
      const ctx = await populated('published')
      const coach = ctx.coach.pb
      expect((await coach.collection('teams').getOne(ctx.team.id)).name).toBe('Secret Team')
      for (const collection of ['score_audit', 'audit_log', 'mail_outbox', 'role_assignments']) {
        await expectDenied(coach.collection(collection).getOne(ctx.records[collection]!))
      }
      await expectDenied(
        coach.collection('teams').update(ctx.team.id, { status: 'withdrawn', name: 'x' }),
      )
    })

    it('users cannot raise their own permissions', async () => {
      const ctx = await populated()
      const judge = ctx.judge.pb
      const judgeId = ctx.judge.id
      await expectDenied(
        judge.collection('role_assignments').create({ user: judgeId, role: 'admin' }),
      )
      await expectDenied(
        judge
          .collection('role_assignments')
          .create({ user: judgeId, role: 'event_manager', event: ctx.event.id }),
      )
      await expectDenied(
        judge
          .collection('role_assignments')
          .update(ctx.records.role_assignments!, { role: 'event_manager' }),
      )
      // Own account: verified flag and email cannot be set directly.
      const unverified = await fx.user({ verified: false })
      await expectDenied(
        unverified.pb.collection('users').update(unverified.id, { verified: true }),
      )
      expect((await fx.su.collection('users').getOne(unverified.id)).verified).toBe(false)
    })
  })

  describe('custom endpoints (M7-11)', () => {
    it('the list of custom endpoints is complete', () => {
      const declared = readdirSync(hooksDir)
        .filter((f) => f.endsWith('.pb.js'))
        .flatMap((f) =>
          [
            ...readFileSync(join(hooksDir, f), 'utf8').matchAll(
              /routerAdd\(\s*'(\w+)',\s*'([^']+)'/g,
            ),
          ].map((m) => `${m[1]} ${m[2]}`),
        )
        .sort()
      expect(ROUTES.map((r) => `${r.method} ${r.path}`).sort()).toEqual(declared)
    })

    it('M7-T09: endpoints that need an account deny guests and unverified users', async () => {
      const ctx = await populated()
      const ids: Record<string, string> = {
        '{id}': ctx.event.id,
        '{action}': 'approve',
      }
      const unverified = server.client()
      const u = await fx.user({ verified: false })
      await unverified.collection('users').authWithPassword(u.email, 'password-1234')
      for (const route of ROUTES.filter((r) => r.access === 'auth')) {
        const path = route.path.replace(/\{\w+\}/g, (p) => ids[p] ?? 'x')
        for (const [who, token] of [
          ['guest', ''],
          ['unverified', unverified.authStore.token],
        ]) {
          const res = await fetch(`${server.url}${path}`, {
            method: route.method,
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: token } : {}),
            },
            body: route.method === 'GET' ? undefined : '{}',
          })
          // Planner data of an event is readable only when the user can see the event.
          expect([401, 403, 404], `${who} ${route.method} ${path} → ${res.status}`).toContain(
            res.status,
          )
        }
      }
    })

    it('event endpoints deny staff of other events', async () => {
      const ctx = await populated()
      const [, , , , judge, headJudge, manager] = await outsiders()
      const calls: [string, string, unknown?][] = [
        ['GET', `/api/events/${ctx.event.id}/judging`],
        ['GET', `/api/games/${ctx.game.id}/sheet`],
        ['PUT', `/api/games/${ctx.game.id}/sheet`, { values: {} }],
        ['POST', `/api/games/${ctx.game.id}/sheet/approve`, {}],
        ['POST', `/api/games/${ctx.game.id}/sheet/correct`, { reason: 'x', values: {} }],
        ['GET', `/api/events/${ctx.event.id}/notifications/schedule`],
        ['POST', `/api/events/${ctx.event.id}/notifications/schedule`, {}],
        ['POST', `/api/events/${ctx.event.id}/schedule/generate`, {}],
        ['GET', `/api/events/${ctx.event.id}/schedule/validation`],
        ['GET', `/api/events/${ctx.event.id}/judges`],
        ['GET', `/api/events/${ctx.event.id}/planner`],
        ['POST', `/api/categories/${ctx.category.id}/ranking/snapshots`, { title: 'x' }],
        ['POST', `/api/categories/${ctx.category.id}/copy`, {}],
        ['GET', `/api/users/${ctx.judge.id}/schedule`],
        ['POST', `/api/mail/outbox/${ctx.records.mail_outbox}/retry`, {}],
        [
          'POST',
          '/api/role-assignments/by-email',
          { email: 'x@test.local', role: 'judge', event: ctx.event.id },
        ],
        ['GET', '/api/admin/users'],
        ['GET', '/api/mail/templates/variables'],
      ]
      for (const [who, pb] of [
        ['judge', judge![1]],
        ['head judge', headJudge![1]],
        ['manager', manager![1]],
      ] as const) {
        for (const [method, path, body] of calls) {
          const error = await pb.send(path, { method, body }).then(
            () => null,
            (e: ClientResponseError) => e,
          )
          expect(error, `${who} ${method} ${path} succeeded`).toBeInstanceOf(ClientResponseError)
          expect([400, 403, 404], `${who} ${method} ${path} → ${error!.status}`).toContain(
            error!.status,
          )
        }
      }
    })
  })

  describe('concurrent updates (M7-T10)', () => {
    async function judged() {
      const ctx = await populated('published')
      const headJudge = await fx.user({ roles: [{ role: 'head_judge', event: ctx.event.id }] })
      const second = await fx.user({ roles: [{ role: 'head_judge', event: ctx.event.id }] })
      const game = await fx.su.collection('games').create({
        round: ctx.round.id,
        team: ctx.team.id,
        status: 'scheduled',
        attempt: 2,
        table: (await fx.su.collection('tables').getFirstListItem(`event = "${ctx.event.id}"`)).id,
        sequence: 2,
      })
      return { ...ctx, headJudge, second, game }
    }
    const sheet = (
      user: TestUser,
      gameId: string,
      action: string,
      body: Record<string, unknown> = {},
    ) => user.pb.send(`/api/games/${gameId}/sheet/${action}`, { method: 'POST', body })

    it('simultaneous submissions: exactly one is stored, the others are refused', async () => {
      const ctx = await judged()
      // The judge's two devices plus retries submit different results at the same moment.
      const { ok, failed } = await settle(
        [1, 2, 3, 4, 5].map((blocks) =>
          sheet(ctx.judge, ctx.game.id, 'submit', { values: sheetValues(blocks) }),
        ),
      )
      expect(ok).toHaveLength(1)
      expect(failed.map((e) => e.status)).toEqual([409, 409, 409, 409])
      const stored = await fx.su
        .collection('score_sheets')
        .getFirstListItem(`game = "${ctx.game.id}"`)
      expect(stored.status).toBe('submitted')
      expect(stored.points).toBe(ok[0]!.value.sheet.points)
      const audit = await fx.su
        .collection('score_audit')
        .getFullList({ filter: `game = "${ctx.game.id}" && action = "submitted"` })
      expect(audit).toHaveLength(1)
    })

    it('simultaneous approvals and corrections never overwrite each other silently', async () => {
      const ctx = await judged()
      await sheet(ctx.judge, ctx.game.id, 'submit', { values: sheetValues(1) })
      const approvals = await settle([
        sheet(ctx.headJudge, ctx.game.id, 'approve'),
        sheet(ctx.second, ctx.game.id, 'approve'),
      ])
      expect(approvals.ok).toHaveLength(1)
      expect(approvals.failed.map((e) => e.status)).toEqual([409])

      // Two head judges correct the same finalized score at once, both based on version 0.
      const corrections = await settle([
        sheet(ctx.headJudge, ctx.game.id, 'correct', {
          values: sheetValues(4),
          reason: 'Video A',
          expected_corrections: 0,
        }),
        sheet(ctx.second, ctx.game.id, 'correct', {
          values: sheetValues(6),
          reason: 'Video B',
          expected_corrections: 0,
        }),
      ])
      expect(corrections.ok).toHaveLength(1)
      expect(corrections.failed.map((e) => e.status)).toEqual([409])
      expect(corrections.failed[0]!.message).toContain('corrected by someone else')
      const winner = corrections.ok[0]!.value.sheet
      const game = await fx.su.collection('games').getOne(ctx.game.id)
      expect(game.points).toBe(winner.points)
      expect([pointsFor(4), pointsFor(6)]).toContain(game.points)
      expect(winner.corrections).toBe(1)

      // A correction based on the outdated version is refused; the current one is accepted.
      await expect(
        sheet(ctx.second, ctx.game.id, 'correct', {
          values: sheetValues(0),
          reason: 'late',
          expected_corrections: 0,
        }),
      ).rejects.toMatchObject({ status: 409 })
      const next = await sheet(ctx.second, ctx.game.id, 'correct', {
        values: sheetValues(0),
        reason: 'Recount',
        expected_corrections: 1,
      })
      expect(next.sheet).toMatchObject({ corrections: 2, points: pointsFor(0) })
    })

    it('simultaneous manual result edits: the later one based on the same version is refused', async () => {
      const ctx = await judged()
      const record = await fx.su.collection('games').create({
        round: ctx.round.id,
        team: ctx.team.id,
        status: 'completed',
        attempt: 3,
        points: 50,
      })
      const edit = (points: number) =>
        ctx.manager.pb.collection('games').update(record.id, {
          status: 'completed',
          points,
          expected_updated: record.updated,
        })
      const { ok, failed } = await settle([edit(70), edit(90)])
      expect(ok).toHaveLength(1)
      expect(failed.map((e) => e.status)).toEqual([409])
      const stored = await fx.su.collection('games').getOne<RecordModel>(record.id)
      expect(stored.points).toBe(ok[0]!.value.points)
    })
  })
})

describe('M7-11 production configuration', () => {
  let server: TestServer
  // A stand-in SPA, so the production setup's index fallback is active.
  const spaDir = mkdtempSync(join(tmpdir(), 'judge26-spa-'))
  writeFileSync(join(spaDir, 'index.html'), '<!doctype html><div id="app"></div>')
  beforeAll(async () => {
    server = await startPocketBase({
      env: { PB_ENV: 'production', BACKUP_CRON: '' },
      publicDir: spaDir,
    })
  })
  afterAll(() => server?.dispose())

  it('development endpoints do not exist in production', async () => {
    for (const route of ROUTES.filter((r) => r.access === 'dev')) {
      const res = await fetch(`${server.url}${route.path}`, {
        method: route.method,
        headers: { 'Content-Type': 'application/json' },
        body: route.method === 'GET' ? undefined : '{}',
      })
      expect(res.status, `${route.method} ${route.path}`).toBe(404)
    }
    const info = await (await fetch(`${server.url}/api/app/info`)).json()
    expect(info.environment).toBe('production')
  })

  it('M7-09: automatic daily backups are enabled by default', async () => {
    const su = await server.superuserClient()
    const settings = await su.settings.getAll()
    expect(settings.backups).toMatchObject({ cron: '30 3 * * *', cronMaxKeep: 14 })
  })

  it('unknown API paths are JSON 404 errors, also with the SPA served (M7-14)', async () => {
    for (const path of ['/api/dev/mails', '/api/nope', '/api/collections/x/nope/deeper']) {
      const res = await fetch(`${server.url}${path}`)
      expect(res.status, path).toBe(404)
      expect(res.headers.get('content-type'), path).toContain('application/json')
    }
    // Built-in and custom routes still work.
    expect((await fetch(`${server.url}/api/health`)).status).toBe(200)
    expect((await fetch(`${server.url}/api/public/events`)).status).toBe(200)
    expect((await fetch(`${server.url}/`)).status).toBe(200)
    expect(await (await fetch(`${server.url}/events/abc`)).text()).toContain('id="app"')
  })

  it('API responses are never cached', async () => {
    const res = await fetch(`${server.url}/api/public/events`)
    expect(res.headers.get('cache-control')).toBe('no-store')
  })
})
