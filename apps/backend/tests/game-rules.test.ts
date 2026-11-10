import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { RecordModel } from 'pocketbase'
import { startPocketBase, type TestServer } from './support/pocketbase'
import { expectDenied, expectFieldError, Fixtures, type TestUser } from './support/fixtures'

/** Minimal ruleset: one boolean criterion worth `points`. */
const simple = (points: number) => ({
  schemaVersion: 1,
  precision: 0,
  root: {
    id: 'total',
    label: 'Total',
    type: 'group',
    aggregate: 'sum',
    children: [{ id: 'task', label: 'Task', type: 'boolean', points, required: true }],
  },
})

describe('Game rules (several games with their own rulesets per category)', () => {
  let server: TestServer
  let fx: Fixtures
  let admin: TestUser
  let event: RecordModel

  beforeAll(async () => {
    server = await startPocketBase()
    fx = await Fixtures.create(server)
    admin = await fx.admin()
    event = await fx.event()
  })
  afterAll(() => server?.dispose())

  async function twoGames(categoryId: string) {
    const rules = admin.pb.collection('game_rules')
    const a = await rules.create({ category: categoryId, key: 'A', name: 'Game A', position: 1 })
    const b = await rules.create({ category: categoryId, key: 'B', name: 'Game B', position: 2 })
    const version = (rule: RecordModel, points: number, status = 'published') =>
      admin.pb.collection('rulesets').create({
        category: categoryId,
        game_rule: rule.id,
        status,
        definition: simple(points),
      })
    return { a, b, version }
  }

  it('numbers versions per game rule', async () => {
    const category = await fx.category(event.id)
    const { a, b, version } = await twoGames(category.id)
    const a1 = await version(a, 1)
    const a2 = await version(a, 2)
    const b1 = await version(b, 3)
    expect([a1.version, a2.version, b1.version]).toEqual([1, 2, 1])
  })

  it('without a game rule, a version joins the only one (or a new "main" one)', async () => {
    const category = await fx.category(event.id)
    const v1 = await admin.pb
      .collection('rulesets')
      .create({ category: category.id, status: 'draft', definition: simple(1) })
    const main = await admin.pb.collection('game_rules').getOne(v1.game_rule)
    expect(main).toMatchObject({ category: category.id, key: 'main' })
    const v2 = await admin.pb
      .collection('rulesets')
      .create({ category: category.id, status: 'draft', definition: simple(2) })
    expect(v2).toMatchObject({ game_rule: main.id, version: 2 })

    await admin.pb.collection('game_rules').create({ category: category.id, key: 'B', name: 'B' })
    await expectFieldError(
      admin.pb
        .collection('rulesets')
        .create({ category: category.id, status: 'draft', definition: simple(3) }),
      'game_rule',
    )
  })

  it('rejects game rules of another category on rulesets and rounds', async () => {
    const category = await fx.category(event.id)
    const other = await fx.category(event.id)
    const { a } = await twoGames(other.id)
    await expectFieldError(
      admin.pb.collection('rulesets').create({
        category: category.id,
        game_rule: a.id,
        status: 'draft',
        definition: simple(1),
      }),
      'game_rule',
    )
    await expectFieldError(
      admin.pb
        .collection('rounds')
        .create({ category: category.id, key: 'R1', name: 'R1', game_rule: a.id }),
      'game_rule',
    )
  })

  it("scores each round with the active version of the round's game rule", async () => {
    const category = await fx.category(event.id)
    const { a, b, version } = await twoGames(category.id)
    await version(a, 10)
    const b1 = await version(b, 20)
    const b2 = await version(b, 30)
    await version(b, 99, 'draft')
    const headJudge = await fx.user({ roles: [{ role: 'head_judge', event: event.id }] })
    const team = await fx.team(event.id, category.id, { status: 'approved' })

    const roundA = await admin.pb
      .collection('rounds')
      .create({ category: category.id, key: 'RA', name: 'Round A', game_rule: a.id })
    const roundB = await admin.pb
      .collection('rounds')
      .create({ category: category.id, key: 'RB', name: 'Round B', game_rule: b.id })
    const gameIn = (round: RecordModel) =>
      admin.pb.collection('games').create({ round: round.id, team: team.id, status: 'scheduled' })
    const sheet = (game: RecordModel) =>
      headJudge.pb.send<{
        ruleset: { id: string; version: number; game_rule: { name: string } }
      }>(`/api/games/${game.id}/sheet`, { method: 'GET' })

    const inA = await sheet(await gameIn(roundA))
    expect(inA.ruleset.game_rule.name).toBe('Game A')
    const inB = await sheet(await gameIn(roundB))
    expect(inB.ruleset).toMatchObject({ id: b2.id, version: 2, game_rule: { name: 'Game B' } })
    expect(inB.ruleset.id).not.toBe(b1.id)

    // Manually recorded results use a version of the category; points come from the sheet.
    const scored = await admin.pb.collection('games').create({
      round: roundB.id,
      team: team.id,
      attempt: 5,
      status: 'completed',
      ruleset: b2.id,
      values: { task: true },
    })
    expect(scored.points).toBe(30)
  })

  it('copying a category copies every game rule and keeps the rounds assigned', async () => {
    const template = await fx.category('', { code: 'TPL-GAMES' })
    const { a, b, version } = await twoGames(template.id)
    await version(a, 1)
    await version(a, 2)
    await version(b, 3)
    await admin.pb
      .collection('rounds')
      .create({ category: template.id, key: 'R1', name: 'R1', game_rule: b.id })

    const copy = await admin.pb.send<RecordModel>(`/api/categories/${template.id}/copy`, {
      method: 'POST',
      body: { event: event.id, code: 'GAMES' },
    })
    const rules = await admin.pb
      .collection('game_rules')
      .getFullList({ filter: `category = "${copy.id}"`, sort: 'position' })
    expect(rules.map((r) => r.key)).toEqual(['A', 'B'])
    const versions = await admin.pb
      .collection('rulesets')
      .getFullList({ filter: `category = "${copy.id}"` })
    const byRule = Object.fromEntries(versions.map((v) => [v.game_rule, v]))
    expect(byRule[rules[0].id]).toMatchObject({ version: 1, definition: simple(2) })
    expect(byRule[rules[1].id]).toMatchObject({ version: 1, definition: simple(3) })
    const [round] = await admin.pb
      .collection('rounds')
      .getFullList({ filter: `category = "${copy.id}"` })
    expect(round.game_rule).toBe(rules[1].id)
  })

  it('a game rule that scored results cannot be deleted; an unused one can', async () => {
    const category = await fx.category(event.id)
    const { a, b, version } = await twoGames(category.id)
    const a1 = await version(a, 5)
    await version(b, 5)
    const team = await fx.team(event.id, category.id, { status: 'approved' })
    const round = await admin.pb
      .collection('rounds')
      .create({ category: category.id, key: 'R1', name: 'R1', game_rule: a.id })
    await admin.pb.collection('games').create({
      round: round.id,
      team: team.id,
      status: 'completed',
      ruleset: a1.id,
      values: { task: true },
    })
    await expectDenied(admin.pb.collection('game_rules').delete(a.id))
    await admin.pb.collection('game_rules').delete(b.id)
    const left = await admin.pb
      .collection('rulesets')
      .getFullList({ filter: `category = "${category.id}"` })
    expect(left.map((v) => v.game_rule)).toEqual([a.id])
  })
})
