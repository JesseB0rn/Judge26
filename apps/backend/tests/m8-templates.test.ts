import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import type { ClientResponseError, RecordModel } from 'pocketbase'
import { startPocketBase, type TestServer } from './support/pocketbase'
import { expectDenied, Fixtures, type TestUser } from './support/fixtures'

// M8-D: setup checklist and event templates (docs/specifications/M8-event-setup.md).

const definition = (points: number) => ({
  schemaVersion: 1,
  root: {
    id: 'total',
    label: 'Total',
    type: 'group',
    aggregate: 'sum',
    children: [{ id: 'task', label: 'Task', type: 'boolean', points }],
  },
})

interface Template {
  format: string
  version: number
  days: { offset: number; label: string; starts_at: string }[]
  categories: {
    code: string
    judges_per_table: number
    game_rules: { key: string; ruleset: { definition: unknown } | null }[]
    rounds: {
      key: string
      game_rule: string
      phases: { phase: string; day: number | null; starts_at: string }[]
    }[]
  }[]
  tables: { name: string; categories: string[] }[]
  columns: { name: string }[]
  blocks: { title: string; day: number; categories: string[]; columns: string[] }[]
  [key: string]: unknown
}

interface Step {
  key: string
  done: boolean
  needs: string[]
  [key: string]: unknown
}

describe('M8-D event templates', () => {
  let server: TestServer
  let fx: Fixtures
  let admin: TestUser

  beforeAll(async () => {
    server = await startPocketBase()
    fx = await Fixtures.create(server)
    admin = await fx.admin()
  })
  afterAll(() => server?.dispose())

  /** An event with everything a template holds, plus people and results it must leave out. */
  async function fullEvent() {
    const su = fx.su
    const event = await fx.event({ venue: 'Bern', description: 'National final' })
    const day1 = await su
      .collection('competition_days')
      .create({ event: event.id, date: '2026-05-09', label: 'Saturday', starts_at: '08:00' })
    const day2 = await su
      .collection('competition_days')
      .create({ event: event.id, date: '2026-05-10', label: 'Sunday', ends_at: '17:00' })
    const category = await fx.category(event.id, { code: 'RMJ', judges_per_table: 3 })
    const other = await fx.category(event.id, { code: 'RME', name: 'RoboMission Elementary' })
    const rule = await su
      .collection('game_rules')
      .create({ category: category.id, key: 'main', name: 'Main game', position: 1 })
    await su.collection('rulesets').create({
      category: category.id,
      game_rule: rule.id,
      status: 'published',
      definition: definition(5),
    })
    // Version 2 is the active one; the template carries only that.
    await su.collection('rulesets').create({
      category: category.id,
      game_rule: rule.id,
      status: 'published',
      definition: definition(7),
    })
    const round = await su.collection('rounds').create({
      category: category.id,
      key: 'R1',
      name: 'Round 1',
      position: 1,
      game_rule: rule.id,
      testing_minutes: 30,
      scoring_minutes: 60,
      day: day2.id,
    })
    const scoring = await su
      .collection('round_phases')
      .getFirstListItem(`round = "${round.id}" && phase = "scoring"`)
    await su.collection('round_phases').update(scoring.id, {
      day: day2.id,
      starts_at: '10:00',
      expected_updated: scoring.updated,
    })
    await su.collection('round_phases').create({
      round: round.id,
      phase: 'check',
      day: day1.id,
      starts_at: '16:00',
      duration_minutes: 45,
    })
    const judge = await fx.user({ name: 'Judy', roles: [{ role: 'judge', event: event.id }] })
    await su.collection('tables').create({
      event: event.id,
      name: 'Table 1',
      position: 1,
      active: true,
      categories: [category.id],
      judges: [judge.id],
    })
    await su.collection('tables').create({
      event: event.id,
      name: 'Table 2',
      position: 2,
      active: false,
      categories: [other.id],
    })
    const column = await su
      .collection('schedule_columns')
      .create({ event: event.id, name: 'Visitors', position: 1, public: true })
    await su.collection('schedule_blocks').create({
      event: event.id,
      day: day1.id,
      starts_at: '12:00',
      duration_minutes: 60,
      title: 'Lunch',
      color: 'amber',
      public: true,
      categories: [category.id],
      columns: [column.id],
    })
    const team = await fx.team(event.id, category.id, { name: 'Robo Rangers', status: 'approved' })
    await su.collection('games').create({ team: team.id, round: round.id, status: 'scheduled' })
    return { event, category, judge }
  }

  const exportOf = (user: TestUser, eventId: string) =>
    user.pb.send<Template>(`/api/events/${eventId}/template`, { method: 'GET' })

  const upload = (user: TestUser, content: unknown, name?: string) =>
    user.pb.send<RecordModel>('/api/event-templates', {
      method: 'POST',
      body: { content: typeof content === 'string' ? content : JSON.stringify(content), name },
    })

  const createFrom = (user: TestUser, id: string, body: Record<string, unknown>) =>
    user.pb.send<RecordModel>(`/api/event-templates/${id}/events`, { method: 'POST', body })

  async function rejection(promise: Promise<unknown>) {
    const error = (await expectDenied(promise)) as ClientResponseError
    expect(error.status).toBe(400)
    return (
      error.response.data as {
        _error: { code: string; message: string; params?: Record<string, unknown> }
      }
    )._error
  }

  it('M8-21 / M8-T12: the template has the setup and no teams, judges, games or scores', async () => {
    const { event, judge } = await fullEvent()
    const template = await exportOf(admin, event.id)
    expect(template.format).toBe('judge26.event-template')
    expect(template.version).toBe(1)
    expect(template.days.map((d) => [d.offset, d.label])).toEqual([
      [0, 'Saturday'],
      [1, 'Sunday'],
    ])
    const rmj = template.categories.find((c) => c.code === 'RMJ')!
    expect(rmj.judges_per_table).toBe(3)
    expect(rmj.game_rules).toHaveLength(1)
    expect(rmj.game_rules[0]!.ruleset!.definition).toEqual(definition(7))
    expect(rmj.rounds[0]!.game_rule).toBe('main')
    expect(rmj.rounds[0]!.phases).toEqual([
      { phase: 'maintenance', day: null, starts_at: '', duration_minutes: 30 },
      { phase: 'check', day: 0, starts_at: '16:00', duration_minutes: 45 },
      { phase: 'scoring', day: 1, starts_at: '10:00', duration_minutes: 60 },
    ])
    expect(template.tables).toEqual([
      { name: 'Table 1', position: 1, active: true, categories: ['RMJ'] },
      { name: 'Table 2', position: 2, active: false, categories: ['RME'] },
    ])
    expect(template.blocks[0]).toMatchObject({
      title: 'Lunch',
      day: 0,
      categories: ['RMJ'],
      columns: ['Visitors'],
    })
    const text = JSON.stringify(template)
    for (const leaked of ['Robo Rangers', 'Judy', judge.id, judge.email, 'contact@test.local']) {
      expect(text).not.toContain(leaked)
    }
    expect(text).not.toMatch(/"(teams|games|judges|scores|members)"/)
  })

  it('M8-22 / M8-23 / M8-T13: an uploaded template creates an independent event with shifted dates', async () => {
    const { event } = await fullEvent()
    const file = await exportOf(admin, event.id)
    const stored = await upload(admin, file, 'Swiss final')
    expect(stored).toMatchObject({ name: 'Swiss final', format_version: 1, origin: 'upload' })

    const created = await createFrom(admin, stored.id, {
      name: 'Swiss final 2027',
      first_day: '2027-05-15',
    })
    expect(created).toMatchObject({
      name: 'Swiss final 2027',
      season: 2027,
      status: 'draft',
      venue: 'Bern',
    })
    const su = fx.su
    const days = await su
      .collection('competition_days')
      .getFullList({ filter: `event = "${created.id}"`, sort: 'date' })
    expect(days.map((d) => [d.date, d.label, d.starts_at, d.ends_at])).toEqual([
      ['2027-05-15', 'Saturday', '08:00', ''],
      ['2027-05-16', 'Sunday', '', '17:00'],
    ])
    const categories = await su
      .collection('categories')
      .getFullList({ filter: `event = "${created.id}"`, sort: 'code' })
    expect(categories.map((c) => c.code)).toEqual(['RME', 'RMJ'])
    const rmj = categories[1]!
    expect(rmj.judges_per_table).toBe(3)
    const rulesets = await su
      .collection('rulesets')
      .getFullList({ filter: `category = "${rmj.id}"` })
    expect(rulesets).toHaveLength(1)
    expect(rulesets[0]).toMatchObject({
      status: 'published',
      version: 1,
      definition: definition(7),
    })
    const [round] = await su
      .collection('rounds')
      .getFullList({ filter: `category = "${rmj.id}"`, expand: 'game_rule' })
    expect(round).toMatchObject({
      key: 'R1',
      testing_minutes: 30,
      scoring_minutes: 60,
      day: days[1]!.id,
    })
    expect(round!.expand?.game_rule.key).toBe('main')
    const phases = await su
      .collection('round_phases')
      .getFullList({ filter: `round = "${round!.id}"`, sort: 'phase' })
    expect(phases.map((p) => [p.phase, p.day, p.starts_at, p.duration_minutes])).toEqual([
      ['check', days[0]!.id, '16:00', 45],
      ['maintenance', '', '', 30],
      ['scoring', days[1]!.id, '10:00', 60],
    ])
    const tables = await su
      .collection('tables')
      .getFullList({ filter: `event = "${created.id}"`, sort: 'position' })
    expect(tables.map((t) => [t.name, t.active, t.categories, t.judges])).toEqual([
      ['Table 1', true, [rmj.id], []],
      ['Table 2', false, [categories[0]!.id], []],
    ])
    const [block] = await su
      .collection('schedule_blocks')
      .getFullList({ filter: `event = "${created.id}"` })
    const [column] = await su
      .collection('schedule_columns')
      .getFullList({ filter: `event = "${created.id}"` })
    expect(block).toMatchObject({
      title: 'Lunch',
      day: days[0]!.id,
      categories: [rmj.id],
      columns: [column!.id],
    })
    for (const collection of ['teams', 'role_assignments']) {
      const records = await su
        .collection(collection)
        .getFullList({ filter: `event = "${created.id}"` })
      expect(records, collection).toEqual([])
    }

    // Independent: changing the source event or deleting the template leaves the copy alone.
    const source = await su
      .collection('categories')
      .getFirstListItem(`event = "${event.id}" && code = "RMJ"`)
    await su.collection('categories').update(source.id, { code: 'RMX', judges_per_table: 1 })
    await su.collection('event_templates').delete(stored.id)
    expect(await su.collection('categories').getOne(rmj.id)).toMatchObject({
      code: 'RMJ',
      judges_per_table: 3,
    })

    const log = await su
      .collection('audit_log')
      .getFullList({ filter: `action = "template.create_event" && event = "${created.id}"` })
    expect(log).toHaveLength(1)
  })

  it('M8-21: admins save an event into the library directly', async () => {
    const { event } = await fullEvent()
    const record = await admin.pb.send<RecordModel>(`/api/events/${event.id}/template`, {
      method: 'POST',
      body: { name: 'Regional', description: 'Two days' },
    })
    expect(record).toMatchObject({ name: 'Regional', description: 'Two days', format_version: 1 })
    expect(record.origin).toContain(event.name)
    expect((record.data as Template).categories).toHaveLength(2)
  })

  it('M8-22 / M8-T14: malformed and newer-version files are rejected with a reason', async () => {
    const { event } = await fullEvent()
    const file = await exportOf(admin, event.id)
    expect((await rejection(upload(admin, '{ not json'))).code).toBe('template_not_json')
    expect((await rejection(upload(admin, { hello: 'world' }))).code).toBe('template_format')

    const newer = await rejection(upload(admin, { ...file, version: 2 }))
    expect(newer.code).toBe('template_too_new')
    expect(newer.message).toContain('format 2')
    expect(newer).toMatchObject({ params: { version: 2, supported: 1 } })

    const broken = structuredClone(file)
    broken.tables[0]!.categories = ['NOPE']
    const reference = await rejection(upload(admin, broken))
    expect(reference.code).toBe('template_invalid')
    expect(reference.message).toContain('tables[0].categories[0]')
    expect(reference.message).toContain('NOPE')
    expect(reference).toMatchObject({ params: { path: 'tables[0].categories[0]' } })

    const badDay = structuredClone(file)
    badDay.blocks[0]!.day = 5
    expect((await rejection(upload(admin, badDay))).message).toContain('blocks[0].day')

    const badRuleset = structuredClone(file)
    badRuleset.categories[1]!.game_rules[0]!.ruleset = { definition: { schemaVersion: 1 } }
    const stored = await upload(admin, badRuleset)
    const invalid = await rejection(
      createFrom(admin, stored.id, { name: 'Broken', first_day: '2027-01-01' }),
    )
    expect(invalid.code).toBe('template_invalid')
    expect(invalid.message).toContain('categories[1].game_rules[0].ruleset')
    // Nothing was created.
    expect(await fx.su.collection('events').getFullList({ filter: 'name = "Broken"' })).toEqual([])

    const missing = await expectDenied(
      createFrom(admin, (await upload(admin, file)).id, { name: '', first_day: '2027-02-30' }),
    )
    expect(Object.keys(missing.response.data)).toEqual(expect.arrayContaining(['name']))
  })

  it('M8-24: admins rename and delete library templates; nobody creates them over the record API', async () => {
    const { event } = await fullEvent()
    const stored = await upload(admin, await exportOf(admin, event.id), 'Old name')
    const renamed = await admin.pb
      .collection('event_templates')
      .update(stored.id, { name: 'New name' })
    expect(renamed.name).toBe('New name')
    await expectDenied(
      admin.pb.collection('event_templates').update(stored.id, { data: { format: 'x' } }),
    )
    await expectDenied(
      admin.pb.collection('event_templates').create({ name: 'Raw', data: { format: 'x' } }),
    )
    const list = await admin.pb.collection('event_templates').getFullList()
    expect(list.map((t) => t.id)).toContain(stored.id)
    await admin.pb.collection('event_templates').delete(stored.id)
  })

  it('M8-24: only admins use the library; managers may download their own event', async () => {
    const { event } = await fullEvent()
    const manager = await fx.user({ roles: [{ role: 'event_manager', event: event.id }] })
    const judge = await fx.user({ roles: [{ role: 'judge', event: event.id }] })
    const stranger = await fx.user({
      roles: [{ role: 'event_manager', event: (await fx.event()).id }],
    })
    const file = await exportOf(manager, event.id)
    expect(file.categories).toHaveLength(2)
    await expectDenied(exportOf(judge, event.id))
    await expectDenied(exportOf(stranger, event.id))
    await expectDenied(upload(manager, file))
    await expectDenied(
      manager.pb.send(`/api/events/${event.id}/template`, { method: 'POST', body: {} }),
    )
    const stored = await upload(admin, file)
    await expectDenied(createFrom(manager, stored.id, { name: 'X', first_day: '2027-01-01' }))
    expect(await manager.pb.collection('event_templates').getFullList()).toEqual([])
  })

  it('M8-20: the setup checklist shows what is done', async () => {
    const steps = async (user: TestUser, id: string) =>
      (await user.pb.send<{ steps: Step[]; complete: boolean }>(`/api/events/${id}/setup`, {}))
        .steps
    const done = (list: Step[]) => list.filter((s) => s.done).map((s) => s.key)

    const empty = await fx.event({ status: 'draft' })
    const manager = await fx.user({ roles: [{ role: 'event_manager', event: empty.id }] })
    const first = await steps(manager, empty.id)
    expect(first.map((s) => s.key)).toEqual([
      'days',
      'categories',
      'rounds',
      'tables',
      'teams',
      'judges',
      'schedule',
      'publish',
    ])
    expect(done(first)).toEqual([])
    expect(first.find((s) => s.key === 'schedule')!.needs).toEqual([
      'days',
      'rounds',
      'tables',
      'teams',
    ])

    const { event } = await fullEvent()
    const full = await steps(admin, event.id)
    // RME has no ruleset, rounds or active table; the active table has a judge; the one game
    // has no table yet.
    expect(done(full)).toEqual(['days', 'teams', 'judges', 'publish'])
    expect(full.find((s) => s.key === 'tables')!.missing).toEqual(['RME'])
    expect(full.find((s) => s.key === 'categories')!.missing).toEqual(['RME'])
    expect(full.find((s) => s.key === 'rounds')!.missing).toEqual(['RME'])
    expect(full.find((s) => s.key === 'schedule')).toMatchObject({
      placed: 0,
      expected: 1,
      timed: 1,
      rounds: 1,
    })

    const judge = await fx.user({ roles: [{ role: 'judge', event: empty.id }] })
    await expectDenied(steps(judge, empty.id))
  })
})
