import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { RecordModel } from 'pocketbase'
import { EXAMPLE_RANKING_CONFIG, type Ranking } from '@judge26/ranking-engine'
import { EXAMPLE_RULESET } from '@judge26/scoring-engine'
import { startPocketBase, type TestServer } from './support/pocketbase'
import { expectDenied, expectFieldError, Fixtures, type TestUser } from './support/fixtures'

describe('M3 rounds, games and ranking', () => {
  let server: TestServer
  let fx: Fixtures
  let admin: TestUser
  let manager: TestUser
  let event: RecordModel
  let category: RecordModel
  let rounds: Record<string, RecordModel>

  beforeAll(async () => {
    server = await startPocketBase()
    fx = await Fixtures.create(server)
    admin = await fx.admin()
    event = await fx.event()
    category = await fx.category(event.id)
    manager = await fx.user({ roles: [{ role: 'event_manager', event: event.id }] })
    rounds = {}
    for (const [i, key] of ['R1', 'R2', 'R3'].entries()) {
      rounds[key] = await manager.pb
        .collection('rounds')
        .create({ category: category.id, key, name: `Round ${i + 1}`, position: i })
    }
  })
  afterAll(() => server?.dispose())

  const approvedTeam = (cat = category, ev = event, name?: string) =>
    fx.team(ev.id, cat.id, { status: 'approved', ...(name ? { name } : {}) })
  const game = (user: TestUser, data: Record<string, unknown>) =>
    user.pb.collection('games').create({ status: 'completed', ...data })
  const snapshot = (user: TestUser, cat: RecordModel, title = 'Official') =>
    user.pb.send<RecordModel & { result: Ranking }>(`/api/categories/${cat.id}/ranking/snapshots`, {
      method: 'POST',
      body: { title },
    })

  it('M3-01: managers create any number of rounds with unique keys', async () => {
    const cat = await fx.category(event.id)
    for (let i = 1; i <= 5; i++) {
      await manager.pb
        .collection('rounds')
        .create({ category: cat.id, key: `R${i}`, name: `Round ${i}`, position: i })
    }
    expect(
      await manager.pb.collection('rounds').getFullList({ filter: `category = "${cat.id}"` }),
    ).toHaveLength(5)
    await expectDenied(
      manager.pb.collection('rounds').create({ category: cat.id, key: 'R1', name: 'Again' }),
    )
    const coach = await fx.user()
    await expectDenied(
      coach.pb.collection('rounds').create({ category: cat.id, key: 'X', name: 'X' }),
    )
    expect(
      await coach.pb.collection('rounds').getFullList({ filter: `category = "${cat.id}"` }),
    ).toHaveLength(5)
  })

  it('M3-02: games belong to one round and a team of the same category', async () => {
    const team = await approvedTeam()
    const g = await game(manager, {
      round: rounds.R1!.id,
      team: team.id,
      points: 40,
      time_ms: 95_000,
    })
    expect(g).toMatchObject({ attempt: 1, points: 40, time_ms: 95_000 })
    await expectDenied(game(manager, { round: rounds.R1!.id, team: team.id, points: 1 })) // same attempt
    expect(
      (await game(manager, { round: rounds.R1!.id, team: team.id, attempt: 2, points: 50 }))
        .attempt,
    ).toBe(2)

    const otherCategory = await fx.category(event.id)
    const foreign = await approvedTeam(otherCategory)
    await expectFieldError(
      game(manager, { round: rounds.R1!.id, team: foreign.id, points: 1 }),
      'team',
      'invalid_team',
    )
    const pending = await fx.team(event.id, category.id, { status: 'submitted' })
    await expectFieldError(
      game(manager, { round: rounds.R1!.id, team: pending.id, points: 1 }),
      'team',
      'team_not_approved',
    )
  })

  it('M3-03: points are derived from the score sheet when a ruleset is used', async () => {
    const ruleset = await admin.pb
      .collection('rulesets')
      .create({ category: category.id, status: 'published', definition: EXAMPLE_RULESET })
    const team = await approvedTeam()
    const values = { flag: true, blocks: 2, parkFull: true, tower: 'two', touches: 1 }
    const scored = await game(manager, {
      round: rounds.R2!.id,
      team: team.id,
      ruleset: ruleset.id,
      values,
      points: 999,
    })
    // 10 + 10 + 15 + 10 − 5 = 40; the manually entered 999 is ignored.
    expect(scored.points).toBe(40)

    await expectFieldError(
      game(manager, {
        round: rounds.R3!.id,
        team: team.id,
        ruleset: ruleset.id,
        values: { blocks: 99 },
      }),
      'values',
      'invalid_score_sheet',
    )
    const draft = await admin.pb
      .collection('rulesets')
      .create({ category: category.id, status: 'draft', definition: EXAMPLE_RULESET })
    await expectFieldError(
      game(manager, { round: rounds.R3!.id, team: team.id, ruleset: draft.id, values }),
      'ruleset',
      'invalid_ruleset',
    )
  })

  it('disqualified and absent games carry no points', async () => {
    const team = await approvedTeam()
    const dq = await game(manager, {
      round: rounds.R1!.id,
      team: team.id,
      status: 'disqualified',
      points: 50,
    })
    expect(dq.points).toBe(0)
  })

  it('game access: staff and the team’s coach read; only managers write', async () => {
    const coach = await fx.user()
    const team = await fx.team(event.id, category.id, { status: 'approved', coach: coach.id })
    const other = await approvedTeam()
    const own = await game(manager, { round: rounds.R1!.id, team: team.id, points: 10 })
    const foreign = await game(manager, { round: rounds.R1!.id, team: other.id, points: 10 })
    const judge = await fx.user({ roles: [{ role: 'judge', event: event.id }] })

    expect((await coach.pb.collection('games').getOne(own.id)).points).toBe(10)
    await expectDenied(coach.pb.collection('games').getOne(foreign.id))
    await expectDenied(coach.pb.collection('games').update(own.id, { points: 100 }))
    expect((await judge.pb.collection('games').getOne(foreign.id)).id).toBe(foreign.id)
    await expectDenied(
      judge.pb
        .collection('games')
        .create({ round: rounds.R2!.id, team: team.id, status: 'completed', points: 1 }),
    )
  })

  it('validates the ranking configuration on save (incl. circular calculations)', async () => {
    await expectFieldError(
      manager.pb
        .collection('categories')
        .update(category.id, { ranking: { schemaVersion: 1, rounds: [] } }),
      'ranking',
      'invalid_ranking_config',
    )
    const circular = {
      ...EXAMPLE_RANKING_CONFIG,
      calculations: [
        { id: 'a', label: 'A', op: 'ADD', operands: [{ calc: 'b' }] },
        { id: 'b', label: 'B', op: 'ADD', operands: [{ calc: 'a' }] },
      ],
      ranking: { keys: [{ source: { calc: 'a' }, field: 'points', order: 'desc' }] },
    }
    const error = await expectFieldError(
      manager.pb.collection('categories').update(category.id, { ranking: circular }),
      'ranking',
    )
    expect(JSON.stringify(error.response)).toContain('Circular calculation')
  })

  describe('ranking snapshots (M3-13 … M3-17)', () => {
    let cat: RecordModel
    let r: Record<string, RecordModel>
    let teams: Record<string, RecordModel>

    beforeAll(async () => {
      cat = await fx.category(event.id)
      r = {}
      for (const key of ['R1', 'R2', 'R3'])
        r[key] = await fx.su.collection('rounds').create({ category: cat.id, key, name: key })
      await fx.su.collection('categories').update(cat.id, { ranking: EXAMPLE_RANKING_CONFIG })
      teams = {}
      for (const name of ['Alpha', 'Bravo', 'Charlie', 'Delta'])
        teams[name] = await approvedTeam(cat, event, name)
      const results: [string, string, number, number][] = [
        // M3-F04 for Alpha: best = R3 (100 pts / 110 s), not the 90 s of R2.
        ['Alpha', 'R1', 100, 120_000],
        ['Alpha', 'R2', 80, 90_000],
        ['Alpha', 'R3', 100, 110_000],
        ['Bravo', 'R1', 100, 110_000],
        ['Bravo', 'R2', 70, 0],
        ['Charlie', 'R1', 60, 100_000],
      ]
      for (const [team, round, points, time] of results) {
        await fx.su.collection('games').create({
          round: r[round]!.id,
          team: teams[team]!.id,
          status: 'completed',
          points,
          time_ms: time,
        })
      }
      await fx.su
        .collection('games')
        .create({ round: r.R2!.id, team: teams.Charlie!.id, status: 'disqualified' })
    })

    it('computes and preserves the ranking with explanations', async () => {
      const snap = await snapshot(manager, cat, 'After round 3')
      const { entries } = snap.result
      expect(entries.map((e) => [e.name, e.rank])).toEqual([
        ['Alpha', 1], // 100 pts / 110 s, total 280
        ['Bravo', 2], // 100 pts / 110 s, total 170 → third key
        ['Charlie', 3],
        ['Delta', 4], // no results: counted as 0 by the "zero" missing policy
      ])
      expect(entries[3]!.provisional).toBe(true)
      expect(entries[0]!.results.best).toMatchObject({
        selected: 'R3',
        points: 100,
        timeMs: 110_000,
      })
      expect(entries[1]!.decidedBy).toBe(2)
      expect(entries[2]!.results.R2!.status).toBe('disqualified')
      expect(entries[2]!.provisional).toBe(true)
      expect(snap).toMatchObject({ title: 'After round 3', created_by: manager.id })
      expect(snap.fingerprint).toMatch(/^[0-9a-f]{16}$/)
    })

    it('M3-T12 / M3-T13: changed results change new rankings; published snapshots stay unchanged', async () => {
      const before = await snapshot(manager, cat, 'Before correction')
      await fx.su.collection('games').create({
        round: r.R3!.id,
        team: teams.Charlie!.id,
        status: 'completed',
        points: 150,
        time_ms: 80_000,
      })
      const after = await snapshot(manager, cat, 'After correction')

      expect(after.result.entries[0]!.name).toBe('Charlie')
      const stored = await manager.pb.collection('ranking_snapshots').getOne(before.id)
      expect(stored.result).toEqual(before.result)
      expect(stored.fingerprint).toBe(before.fingerprint)
      expect(stored.result.entries[0].name).toBe('Alpha')
    })

    it('snapshots are immutable and only created by the server', async () => {
      const snap = await snapshot(manager, cat)
      await expectDenied(
        admin.pb.collection('ranking_snapshots').update(snap.id, { title: 'Edited' }),
      )
      await expectDenied(fx.su.collection('ranking_snapshots').update(snap.id, { title: 'Edited' }))
      await expectDenied(
        admin.pb
          .collection('ranking_snapshots')
          .create({ category: cat.id, title: 'Fake', result: {} }),
      )
      await expectDenied(manager.pb.collection('ranking_snapshots').delete(snap.id))
      await admin.pb.collection('ranking_snapshots').delete(snap.id)
    })

    it('only managers publish snapshots; staff read them; coaches cannot', async () => {
      const judge = await fx.user({ roles: [{ role: 'judge', event: event.id }] })
      const coach = await fx.user()
      const error = await expectDenied(snapshot(judge, cat))
      expect(error.status).toBe(403)
      const snap = await snapshot(manager, cat)
      expect((await judge.pb.collection('ranking_snapshots').getOne(snap.id)).id).toBe(snap.id)
      await expectDenied(coach.pb.collection('ranking_snapshots').getOne(snap.id))
      await expectFieldError(snapshot(manager, cat, '  '), 'title', 'required')
    })

    it('requires a ranking configuration', async () => {
      const empty = await fx.category(event.id)
      const error = await expectDenied(snapshot(manager, empty))
      expect(error.response.message).toContain('no ranking configuration')
    })
  })

  it('copying a category copies its rounds and ranking configuration', async () => {
    const template = await fx.category('', { code: 'TPL-RANK', ranking: EXAMPLE_RANKING_CONFIG })
    for (const key of ['R1', 'R2'])
      await fx.su.collection('rounds').create({ category: template.id, key, name: key })
    const copy = await admin.pb.send<RecordModel>(`/api/categories/${template.id}/copy`, {
      method: 'POST',
      body: { event: event.id, code: 'RANKED' },
    })
    expect(copy.ranking).toEqual(EXAMPLE_RANKING_CONFIG)
    const copied = await admin.pb
      .collection('rounds')
      .getFullList({ filter: `category = "${copy.id}"`, sort: 'key' })
    expect(copied.map((x) => x.key)).toEqual(['R1', 'R2'])
  })
})
