import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type PocketBase from 'pocketbase'
import type { RecordModel } from 'pocketbase'
import { startPocketBase, type TestServer } from './support/pocketbase'
import { expectDenied, Fixtures, type TestUser } from './support/fixtures'

// Permission matrix for the access rules of every collection that depends on roles.
// The rules look up the signed-in user's own role assignments and teams (migration
// 1763700000_scoped_access_rules.js); these tests pin down who sees and changes what, in
// particular for users whose roles differ between events.

const def = {
  schemaVersion: 1,
  root: {
    id: 'total',
    label: 'Total',
    type: 'group',
    aggregate: 'sum',
    children: [{ id: 'task', label: 'Task', type: 'boolean', points: 1 }],
  },
}

/** Keys of the records an event "world" has: A, B published; D draft; X, Y archived; T templates. */
type Key = 'A' | 'B' | 'D' | 'X' | 'Y' | 'T'
type World = Record<string, Partial<Record<Key, RecordModel>>>

describe('access rules', () => {
  let server: TestServer
  let fx: Fixtures
  const w: World = {}
  const actors: Record<string, TestUser> = {}
  let anon: PocketBase

  const add = (collection: string, key: Key, record: RecordModel) => {
    ;(w[collection] ??= {})[key] = record
    return record
  }

  beforeAll(async () => {
    server = await startPocketBase()
    fx = await Fixtures.create(server)
    const su = fx.su

    // Linked to a team before the coach role was retired (M8-A); that grants nothing now.
    const formerCoach = await fx.user()
    const tableJudge = await fx.user()

    const events = {
      A: await fx.event({ status: 'published' }),
      B: await fx.event({ status: 'published' }),
      D: await fx.event({ status: 'draft' }),
      X: await fx.event({ status: 'archived' }),
      Y: await fx.event({ status: 'archived' }),
    }
    for (const [key, event] of Object.entries(events)) add('events', key as Key, event)
    await su
      .collection('role_assignments')
      .create({ user: tableJudge.id, role: 'judge', event: events.A.id })
    // Judge of table B, not one of the actors.
    const otherJudge = await fx.user({ roles: [{ role: 'judge', event: events.B.id }] })

    const template = add('categories', 'T', await fx.category(''))
    const templateRule = add(
      'game_rules',
      'T',
      await su.collection('game_rules').create({ category: template.id, key: 'G', name: 'G' }),
    )
    add(
      'rulesets',
      'T',
      await su.collection('rulesets').create({
        category: template.id,
        game_rule: templateRule.id,
        status: 'draft',
        definition: def,
      }),
    )
    add(
      'rounds',
      'T',
      await su.collection('rounds').create({ category: template.id, key: 'R1', name: 'R1' }),
    )
    add(
      'ranking_snapshots',
      'T',
      await su.collection('ranking_snapshots').create({ category: template.id, title: 'T' }),
    )

    for (const key of ['A', 'B', 'D', 'X', 'Y'] as const) {
      const event = events[key]
      const category = add('categories', key, await fx.category(event.id))
      add(
        'competition_days',
        key,
        await su.collection('competition_days').create({ event: event.id, date: '2026-05-01' }),
      )
      if (key === 'D' || key === 'Y') continue

      add(
        'rounds',
        key,
        await su.collection('rounds').create({ category: category.id, key: 'R1', name: 'R1' }),
      )
      const table = add(
        'tables',
        key,
        await su.collection('tables').create({
          event: event.id,
          name: 'T1',
          active: true,
          judge: key === 'A' ? tableJudge.id : key === 'B' ? otherJudge.id : '',
        }),
      )
      const team = add(
        'teams',
        key,
        await fx.team(event.id, category.id, {
          status: 'approved',
          coach: key === 'X' ? formerCoach.id : '',
        }),
      )
      if (key === 'X') continue

      const rule = add(
        'game_rules',
        key,
        await su.collection('game_rules').create({ category: category.id, key: 'G', name: 'G' }),
      )
      add(
        'rulesets',
        key,
        await su
          .collection('rulesets')
          .create({ category: category.id, game_rule: rule.id, status: 'draft', definition: def }),
      )
      const game = add(
        'games',
        key,
        await su.collection('games').create({
          round: w.rounds![key]!.id,
          team: team.id,
          table: table.id,
          sequence: 1,
          status: 'scheduled',
        }),
      )
      add(
        'score_sheets',
        key,
        await su
          .collection('score_sheets')
          .create({ game: game.id, status: 'submitted', outcome: 'completed' }),
      )
      add(
        'score_audit',
        key,
        await su.collection('score_audit').create({ game: game.id, action: 'submitted' }),
      )
      add(
        'ranking_snapshots',
        key,
        await su.collection('ranking_snapshots').create({ category: category.id, title: key }),
      )
    }

    // Noise: assignments and teams of other people must not leak into anyone's checks.
    for (const key of ['A', 'B', 'D', 'X', 'Y'] as const) {
      await fx.user({
        roles: [
          { role: 'event_manager', event: events[key].id },
          { role: 'head_judge', event: events[key].id },
        ],
      })
    }

    actors.admin = await fx.admin()
    actors.managerA = await fx.user({
      roles: [
        { role: 'event_manager', event: events.A.id },
        { role: 'event_manager', event: events.X.id },
      ],
    })
    // Judges event A but manages event B: must not manage A.
    actors.mixed = await fx.user({
      roles: [
        { role: 'judge', event: events.A.id },
        { role: 'event_manager', event: events.B.id },
      ],
    })
    // Head judge of B, judge of A and D: reviews score sheets of B only.
    actors.reviewer = await fx.user({
      roles: [
        { role: 'head_judge', event: events.B.id },
        { role: 'judge', event: events.A.id },
        { role: 'judge', event: events.D.id },
      ],
    })
    actors.tableJudge = tableJudge
    actors.formerCoach = formerCoach
    actors.nobody = await fx.user()
    actors.unverifiedAdmin = await fx.user({ verified: false, roles: [{ role: 'admin' }] })
    anon = server.client()
  })
  afterAll(() => server?.dispose())

  /** Keys of the world records in `collection` that `pb` can list, checked against view too. */
  async function visible(pb: PocketBase, collection: string): Promise<string> {
    const records = w[collection]!
    const byId = new Map(Object.entries(records).map(([key, r]) => [r!.id, key]))
    const filter = [...byId.keys()].map((id) => `id = "${id}"`).join(' || ')
    const listed = (await pb.collection(collection).getFullList({ filter }))
      .map((r) => byId.get(r.id)!)
      .sort()
    // The view rule matches the list rule for every collection here.
    for (const [key, record] of Object.entries(records)) {
      const viewed = await pb
        .collection(collection)
        .getOne(record!.id)
        .then(
          () => true,
          () => false,
        )
      expect(viewed, `${collection} ${key}: view and list disagree`).toBe(listed.includes(key))
    }
    return listed.join('')
  }

  // Expected visible keys per actor and collection (A, B published; D draft; X, Y archived;
  // T templates). managerA also manages archived X; formerCoach is still linked to the team of
  // archived X (M8-T02: that grants nothing).
  const expected: Record<string, Record<string, string>> = {
    admin: {
      events: 'ABDXY',
      categories: 'ABDTXY',
      competition_days: 'ABDXY',
      rounds: 'ABTX',
      game_rules: 'ABT',
      rulesets: 'ABT',
      tables: 'ABX',
      teams: 'ABX',
      games: 'AB',
      ranking_snapshots: 'ABT',
      score_sheets: 'AB',
      score_audit: 'AB',
    },
    managerA: {
      events: 'ABX',
      categories: 'ABTX',
      competition_days: 'ABX',
      rounds: 'ABTX',
      game_rules: 'ABT',
      rulesets: 'ABT',
      tables: 'ABX',
      teams: 'AX',
      games: 'A',
      ranking_snapshots: 'A',
      score_sheets: 'A',
      score_audit: 'A',
    },
    mixed: {
      events: 'AB',
      categories: 'ABT',
      competition_days: 'AB',
      rounds: 'ABT',
      game_rules: 'ABT',
      rulesets: 'ABT',
      tables: 'AB',
      teams: 'AB',
      games: 'AB',
      ranking_snapshots: 'AB',
      score_sheets: 'B',
      score_audit: 'B',
    },
    reviewer: {
      events: 'ABD',
      categories: 'ABD',
      competition_days: 'ABD',
      rounds: 'AB',
      game_rules: 'AB',
      rulesets: 'AB',
      tables: 'AB',
      teams: 'AB',
      games: 'AB',
      ranking_snapshots: 'AB',
      score_sheets: 'B',
      score_audit: 'B',
    },
    tableJudge: {
      events: 'AB',
      categories: 'AB',
      competition_days: 'AB',
      rounds: 'AB',
      game_rules: 'AB',
      rulesets: 'AB',
      tables: 'AB',
      teams: 'A',
      games: 'A',
      ranking_snapshots: 'A',
      score_sheets: 'A',
      score_audit: 'A',
    },
    formerCoach: {
      events: 'AB',
      categories: 'AB',
      competition_days: 'AB',
      rounds: 'AB',
      game_rules: 'AB',
      rulesets: 'AB',
      tables: 'AB',
      teams: '',
      games: '',
      ranking_snapshots: '',
      score_sheets: '',
      score_audit: '',
    },
    // No roles at all: the role join yields an empty row, which must not match the
    // templates (records with an empty event).
    nobody: {
      events: 'AB',
      categories: 'AB',
      competition_days: 'AB',
      rounds: 'AB',
      game_rules: 'AB',
      rulesets: 'AB',
      tables: 'AB',
      teams: '',
      games: '',
      ranking_snapshots: '',
      score_sheets: '',
      score_audit: '',
    },
  }

  for (const [actor, collections] of Object.entries(expected)) {
    it(`${actor} sees exactly the expected records`, async () => {
      const seen: Record<string, string> = {}
      for (const collection of Object.keys(collections)) {
        seen[collection] = await visible(actors[actor]!.pb, collection)
      }
      expect(seen).toEqual(collections)
    })
  }

  it('unverified and anonymous users see nothing', async () => {
    for (const pb of [actors.unverifiedAdmin!.pb, anon]) {
      for (const collection of Object.keys(expected.admin!)) {
        expect(await visible(pb, collection), collection).toBe('')
      }
    }
  })

  it('role assignments and users: own rows only, except for admins', async () => {
    const { managerA, mixed, admin } = actors
    const own = await mixed!.pb.collection('role_assignments').getFullList()
    expect(own.map((r) => r.user)).toEqual([mixed!.id, mixed!.id])
    const all = await admin!.pb.collection('role_assignments').getFullList()
    expect(all.map((r) => r.user)).toEqual(expect.arrayContaining([managerA!.id, mixed!.id]))

    expect((await mixed!.pb.collection('users').getFullList()).map((u) => u.id)).toEqual([
      mixed!.id,
    ])
    await expectDenied(mixed!.pb.collection('users').getOne(managerA!.id))
    expect((await admin!.pb.collection('users').getOne(mixed!.id)).id).toBe(mixed!.id)

    for (const user of [managerA!, mixed!]) {
      await expectDenied(
        user.pb.collection('role_assignments').create({ user: user.id, role: 'admin', event: '' }),
      )
      await expectDenied(
        user.pb.collection('role_assignments').update(own[0]!.id, { role: 'event_manager' }),
      )
      await expectDenied(user.pb.collection('role_assignments').delete(own[0]!.id))
    }
    await expectDenied(
      actors
        .unverifiedAdmin!.pb.collection('role_assignments')
        .create({ user: mixed!.id, role: 'admin', event: '' }),
    )
  })

  // One harmless update per collection with an update rule.
  const updates: Record<string, () => Record<string, unknown>> = {
    events: () => ({ name: `Event ${Math.random()}` }),
    categories: () => ({ name: `Category ${Math.random()}` }),
    competition_days: () => ({ label: `Day ${Math.random()}` }),
    rounds: () => ({ name: `Round ${Math.random()}` }),
    game_rules: () => ({ name: `Game ${Math.random()}` }),
    rulesets: () => ({ notes: `Notes ${Math.random()}` }),
    tables: () => ({ name: `Table ${Math.random()}` }),
    teams: () => ({ name: `Team ${Math.random()}` }),
    games: () => ({ notes: `Notes ${Math.random()}` }),
  }

  async function canUpdate(user: TestUser, collection: string, key: Key) {
    const record = w[collection]![key]!
    return user.pb
      .collection(collection)
      .update(record.id, updates[collection]!())
      .then(
        () => true,
        () => false,
      )
  }

  // Which world records each actor may update. Archived events (X, Y) keep their records
  // read-only even for admins where the rule says so (days, games); the event itself and
  // its teams stay editable by its managers and admins.
  const none = Object.fromEntries(Object.keys(updates).map((c) => [c, '']))
  const writable: Record<string, Record<string, string>> = {
    admin: {
      events: 'ABDXY',
      categories: 'ABDTXY',
      competition_days: 'ABD',
      rounds: 'ABTX',
      game_rules: 'ABT',
      rulesets: 'ABT',
      tables: 'ABX',
      teams: 'ABX',
      games: 'AB',
    },
    managerA: {
      events: 'AX',
      categories: 'A',
      competition_days: 'A',
      rounds: 'A',
      game_rules: 'A',
      rulesets: 'A',
      tables: 'A',
      teams: 'AX',
      games: 'A',
    },
    mixed: {
      events: 'B',
      categories: 'B',
      competition_days: 'B',
      rounds: 'B',
      game_rules: 'B',
      rulesets: 'B',
      tables: 'B',
      teams: 'B',
      games: 'B',
    },
    reviewer: none,
    tableJudge: none,
    formerCoach: none,
    nobody: none,
    unverifiedAdmin: none,
  }

  for (const [actor, want] of Object.entries(writable)) {
    it(`${actor} can change exactly the expected records`, async () => {
      const result: Record<string, string> = {}
      for (const collection of Object.keys(updates)) {
        let changed = ''
        for (const key of (Object.keys(w[collection]!) as Key[]).sort()) {
          if (await canUpdate(actors[actor]!, collection, key)) changed += key
        }
        result[collection] = changed
      }
      expect(result).toEqual(want)
    })
  }

  it('managers create records only in their own, non-archived events', async () => {
    const { managerA, mixed } = actors
    const create = (user: TestUser, key: Key) =>
      user.pb
        .collection('rounds')
        .create({ category: w.categories![key]!.id, key: 'NEW', name: 'New' })

    expect((await create(managerA!, 'A')).id).toBeTruthy()
    await expectDenied(create(managerA!, 'B'))
    await expectDenied(create(managerA!, 'X'))
    await expectDenied(create(managerA!, 'T'))
    await expectDenied(create(mixed!, 'A'))
    expect((await create(mixed!, 'B')).id).toBeTruthy()

    await expectDenied(
      mixed!.pb.collection('categories').create({
        event: w.events!.A!.id,
        name: 'X',
        code: 'XX',
        min_team_size: 1,
        max_team_size: 2,
      }),
    )
    await expectDenied(
      mixed!.pb
        .collection('competition_days')
        .create({ event: w.events!.A!.id, date: '2026-06-01' }),
    )
    await expectDenied(
      mixed!.pb.collection('tables').create({ event: w.events!.A!.id, name: 'New' }),
    )
    await expectDenied(
      mixed!.pb
        .collection('games')
        .create({ round: w.rounds!.A!.id, team: w.teams!.A!.id, status: 'scheduled' }),
    )
    await expectDenied(
      mixed!.pb.collection('events').create({ name: 'New', season: 2026, status: 'draft' }),
    )
  })

  it('records cannot be moved into an event the user does not manage', async () => {
    const { mixed } = actors
    await expectDenied(
      mixed!.pb.collection('rounds').update(w.rounds!.B!.id, { category: w.categories!.A!.id }),
    )
    await expectDenied(
      mixed!.pb.collection('tables').update(w.tables!.B!.id, { event: w.events!.A!.id }),
    )
    await expectDenied(
      mixed!.pb.collection('categories').update(w.categories!.B!.id, { event: w.events!.A!.id }),
    )
  })

  it('deletes: managers only in their event, score records and snapshots never', async () => {
    const { managerA, mixed, admin } = actors
    const day = (event: Key) =>
      fx.su
        .collection('competition_days')
        .create({ event: w.events![event]!.id, date: '2026-07-01' })

    const dayA = await day('A')
    await expectDenied(mixed!.pb.collection('competition_days').delete(dayA.id))
    await managerA!.pb.collection('competition_days').delete(dayA.id)

    await expectDenied(managerA!.pb.collection('teams').delete(w.teams!.A!.id))
    await expectDenied(
      managerA!.pb.collection('ranking_snapshots').delete(w.ranking_snapshots!.A!.id),
    )
    for (const user of [managerA!, admin!]) {
      await expectDenied(user.pb.collection('score_sheets').delete(w.score_sheets!.A!.id))
      await expectDenied(
        user.pb.collection('score_sheets').update(w.score_sheets!.A!.id, { status: 'finalized' }),
      )
      await expectDenied(user.pb.collection('score_audit').delete(w.score_audit!.A!.id))
    }
    const snapshot = await fx.su
      .collection('ranking_snapshots')
      .create({ category: w.categories!.A!.id, title: 'tmp' })
    await admin!.pb.collection('ranking_snapshots').delete(snapshot.id)
  })

  it('a role granted or revoked takes effect on the next request', async () => {
    const user = await fx.user()
    const category = w.categories!.A!
    expect(await canUpdate(user, 'categories', 'A')).toBe(false)
    const role = await fx.su
      .collection('role_assignments')
      .create({ user: user.id, role: 'event_manager', event: category.event })
    expect(await canUpdate(user, 'categories', 'A')).toBe(true)
    await fx.su.collection('role_assignments').delete(role.id)
    expect(await canUpdate(user, 'categories', 'A')).toBe(false)
  })
})
