import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { startPocketBase, type TestServer } from './support/pocketbase'
import { expectDenied, Fixtures } from './support/fixtures'

// M10-31 – M10-34: print center data. See docs/specifications/M10-print-center.md.

interface PrintData {
  event: { id: string; name: string }
  days: { id: string; date: string }[]
  categories: { id: string; code: string }[]
  rounds: {
    id: string
    key: string
    phases: { phase: string; day: string; starts_at: string; duration_minutes: number }[]
  }[]
  tables: { id: string; name: string; judges: { name: string }[] }[]
  teams: {
    id: string
    name: string
    organization: string
    category: string
    games: { round: string; table: string; sequence: number }[]
  }[]
}

describe('M10-F print center data', () => {
  let server: TestServer
  let fx: Fixtures

  beforeAll(async () => {
    server = await startPocketBase()
    fx = await Fixtures.create(server)
  })
  afterAll(() => server?.dispose())

  async function setup() {
    const event = await fx.event({ status: 'draft' })
    const category = await fx.category(event.id, { code: 'RMJ' })
    const manager = await fx.user({ roles: [{ role: 'event_manager', event: event.id }] })
    const headJudge = await fx.user({ roles: [{ role: 'head_judge', event: event.id }] })
    const judge = await fx.user({ name: 'Judy', roles: [{ role: 'judge', event: event.id }] })
    const sat = await fx.su
      .collection('competition_days')
      .create({ event: event.id, date: '2026-06-13', label: 'Saturday' })
    const sun = await fx.su
      .collection('competition_days')
      .create({ event: event.id, date: '2026-06-14', label: 'Sunday' })
    const table = await fx.su.collection('tables').create({
      event: event.id,
      name: 'Table 1',
      active: true,
      position: 1,
      categories: [category.id],
      judges: [judge.id],
    })
    const team = await fx.team(event.id, category.id, {
      name: 'Robo Rangers',
      organization: 'School',
      status: 'approved',
    })
    await fx.team(event.id, category.id, { name: 'Pending', status: 'submitted' })
    const rounds = []
    for (const [i, day] of [sat, sun].entries()) {
      const round = await manager.pb.collection('rounds').create({
        category: category.id,
        key: `R${i + 1}`,
        name: `Round ${i + 1}`,
        position: i + 1,
        testing_minutes: 30,
        scoring_minutes: 60,
        day: day.id,
        check_mode: 'off',
      })
      const scoring = await fx.su
        .collection('round_phases')
        .getFirstListItem(`round = "${round.id}" && phase = "scoring"`)
      await fx.su.collection('round_phases').update(scoring.id, {
        starts_at: '10:00',
        expected_updated: scoring.updated,
      })
      await fx.su.collection('games').create({
        round: round.id,
        team: team.id,
        status: 'scheduled',
        table: table.id,
        sequence: i + 2,
      })
      rounds.push(round)
    }
    return { event, category, manager, headJudge, judge, sat, sun, table, team, rounds }
  }

  const get = (pb: Fixtures['su'], eventId: string) =>
    pb.send<PrintData>(`/api/events/${eventId}/print`, {})

  it('M10-T47: teams with their games on two days, rounds with phases, tables with judges', async () => {
    const ctx = await setup()
    const data = await get(ctx.headJudge.pb, ctx.event.id)
    expect(data.teams.map((t) => [t.name, t.organization, t.category])).toEqual([
      ['Robo Rangers', 'School', ctx.category.id],
    ])
    expect(data.teams[0]!.games.map((g) => [g.round, g.table, g.sequence])).toEqual([
      [ctx.rounds[0]!.id, ctx.table.id, 2],
      [ctx.rounds[1]!.id, ctx.table.id, 3],
    ])
    const round = data.rounds.find((r) => r.id === ctx.rounds[1]!.id)!
    expect(round.phases.map((p) => [p.phase, p.day, p.starts_at])).toEqual([
      ['maintenance', '', ''],
      ['scoring', ctx.sun.id, '10:00'],
    ])
    expect(data.tables).toEqual([
      {
        id: ctx.table.id,
        name: 'Table 1',
        categories: [ctx.category.id],
        judges: [{ id: ctx.judge.id, name: 'Judy' }],
      },
    ])
    expect((await get(ctx.manager.pb, ctx.event.id)).teams).toHaveLength(1)
  })

  it('M10-T46: judges and staff of other events are denied', async () => {
    const ctx = await setup()
    const other = await setup()
    await expectDenied(get(ctx.judge.pb, ctx.event.id))
    await expectDenied(get(other.headJudge.pb, ctx.event.id))
    await expectDenied(get((await fx.user()).pb, ctx.event.id))
  })
})
