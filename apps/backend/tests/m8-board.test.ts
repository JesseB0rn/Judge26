import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import type { ClientResponseError, RecordModel } from 'pocketbase'
import { startPocketBase, type TestServer } from './support/pocketbase'
import { expectDenied, Fixtures, type TestUser } from './support/fixtures'

// M8-E: assignment board (docs/specifications/M8-board.md).

interface Board {
  categories: { id: string; judges_per_table: number }[]
  rounds: { id: string; category: string }[]
  tables: { id: string; name: string; category: string; judges: string[]; updated: string }[]
  teams: { id: string; name: string; category: string }[]
  games: {
    id: string
    round: string
    team: string
    table: string
    sequence: number
    status: string
    updated: string
  }[]
  judges: { id: string; name: string; role: string }[]
}

describe('M8-E assignment board', () => {
  let server: TestServer
  let fx: Fixtures

  beforeAll(async () => {
    server = await startPocketBase()
    fx = await Fixtures.create(server)
  })
  afterAll(() => server?.dispose())

  async function setup(teams = 3, rounds = 3) {
    const event = await fx.event()
    const category = await fx.category(event.id, { code: 'RM1' })
    const other = await fx.category(event.id, { code: 'RM2', name: 'RoboMission Elementary' })
    const manager = await fx.user({ roles: [{ role: 'event_manager', event: event.id }] })
    const judges = [
      await fx.user({ name: 'Judy', roles: [{ role: 'judge', event: event.id }] }),
      await fx.user({ name: 'Jules', roles: [{ role: 'judge', event: event.id }] }),
      await fx.user({ name: 'Jo', roles: [{ role: 'head_judge', event: event.id }] }),
    ]
    const roundIds: string[] = []
    for (let i = 1; i <= rounds; i++) {
      const round = await manager.pb.collection('rounds').create({
        category: category.id,
        key: `R${i}`,
        name: `Round ${i}`,
        position: i,
        testing_minutes: 0,
        scoring_minutes: 30,
      })
      roundIds.push(round.id)
    }
    const table = (name: string, position: number, categories: string[] = [category.id]) =>
      manager.pb
        .collection('tables')
        .create({ event: event.id, name, active: true, position, categories })
    const A = await table('A', 1)
    const B = await table('B', 2)
    const C = await table('C', 3, [other.id])
    const teamRecords: RecordModel[] = []
    for (let i = 0; i < teams; i++) {
      teamRecords.push(
        await fx.team(event.id, category.id, { name: `Team ${i + 1}`, status: 'approved' }),
      )
    }
    return {
      event,
      category,
      other,
      manager,
      judges,
      rounds: roundIds,
      A,
      B,
      C,
      teams: teamRecords,
    }
  }

  const load = (user: TestUser, eventId: string) =>
    user.pb.send<Board>(`/api/events/${eventId}/board`, {})

  /** The versions a client states for a move: games of the team and of the tables involved. */
  function expectedFor(board: Board, team: string, tables: string[], round?: string) {
    const rounds = round
      ? [round]
      : board.rounds
          .filter((r) => r.category === board.teams.find((t) => t.id === team)!.category)
          .map((r) => r.id)
    const first = rounds[0]
    const source = board.games.find((g) => g.round === first && g.team === team && g.table)?.table
    const involved = [...tables, ...(source ? [source] : [])]
    return Object.fromEntries(
      board.games
        .filter((g) => rounds.includes(g.round) && (g.team === team || involved.includes(g.table)))
        .map((g) => [g.id, g.updated]),
    )
  }

  async function move(
    user: TestUser,
    eventId: string,
    board: Board,
    body: { team: string; table: string; index: number; round?: string },
  ) {
    return user.pb.send<Board>(`/api/events/${eventId}/board/teams`, {
      method: 'POST',
      body: {
        ...body,
        expected: expectedFor(board, body.team, [body.table].filter(Boolean), body.round),
      },
    })
  }

  /** Team names on a table per round, by sequence. */
  function order(board: Board, table: string) {
    return board.rounds
      .filter((r) => board.games.some((g) => g.round === r.id))
      .map((r) =>
        board.games
          .filter((g) => g.round === r.id && g.table === table)
          .sort((a, b) => a.sequence - b.sequence)
          .map((g) => board.teams.find((t) => t.id === g.team)!.name),
      )
  }

  it('M8-25: managers load the board; judges and outsiders cannot', async () => {
    const ctx = await setup()
    const board = await load(ctx.manager, ctx.event.id)
    expect(board.tables.map((t) => [t.name, t.category])).toEqual([
      ['A', ctx.category.id],
      ['B', ctx.category.id],
      ['C', ctx.other.id],
    ])
    expect(board.categories.find((c) => c.id === ctx.category.id)!.judges_per_table).toBe(2)
    expect(board.judges.map((j) => [j.name, j.role])).toEqual([
      ['Jo', 'head_judge'],
      ['Judy', 'judge'],
      ['Jules', 'judge'],
    ])
    await expectDenied(load(ctx.judges[0], ctx.event.id))
    await expectDenied(load(await fx.user(), ctx.event.id))
  })

  it('M8-T15, M8-31: placing teams writes every round, rotated by one slot per round', async () => {
    const ctx = await setup()
    let board = await load(ctx.manager, ctx.event.id)
    for (const [i, team] of ctx.teams.entries()) {
      board = await move(ctx.manager, ctx.event.id, board, {
        team: team.id,
        table: ctx.A.id,
        index: i,
      })
    }
    expect(order(board, ctx.A.id)).toEqual([
      ['Team 1', 'Team 2', 'Team 3'],
      ['Team 3', 'Team 1', 'Team 2'],
      ['Team 2', 'Team 3', 'Team 1'],
    ])
    // Reorder within the table: Team 3 to the top.
    board = await move(ctx.manager, ctx.event.id, board, {
      team: ctx.teams[2].id,
      table: ctx.A.id,
      index: 0,
    })
    expect(order(board, ctx.A.id)[0]).toEqual(['Team 3', 'Team 1', 'Team 2'])
    // Move Team 1 to table B: both tables are rewritten in every round.
    board = await move(ctx.manager, ctx.event.id, board, {
      team: ctx.teams[0].id,
      table: ctx.B.id,
      index: 0,
    })
    expect(order(board, ctx.A.id)).toEqual([
      ['Team 3', 'Team 2'],
      ['Team 2', 'Team 3'],
      ['Team 3', 'Team 2'],
    ])
    expect(order(board, ctx.B.id)).toEqual([['Team 1'], ['Team 1'], ['Team 1']])
    // Sequences are positive and unique per round and table.
    for (const g of board.games.filter((g) => g.table)) expect(g.sequence).toBeGreaterThan(0)
  })

  it('M8-31: with a round selected only that round changes', async () => {
    const ctx = await setup(2)
    let board = await load(ctx.manager, ctx.event.id)
    board = await move(ctx.manager, ctx.event.id, board, {
      team: ctx.teams[0].id,
      table: ctx.A.id,
      index: 0,
    })
    board = await move(ctx.manager, ctx.event.id, board, {
      team: ctx.teams[1].id,
      table: ctx.A.id,
      index: 1,
    })
    board = await move(ctx.manager, ctx.event.id, board, {
      team: ctx.teams[1].id,
      table: ctx.B.id,
      index: 0,
      round: ctx.rounds[1],
    })
    // Round 3 rotates two teams by two slots: the base order again.
    expect(order(board, ctx.A.id)).toEqual([['Team 1', 'Team 2'], ['Team 1'], ['Team 1', 'Team 2']])
    expect(order(board, ctx.B.id)).toEqual([[], ['Team 2'], []])
  })

  it('takes a team off the tables', async () => {
    const ctx = await setup(2)
    let board = await load(ctx.manager, ctx.event.id)
    board = await move(ctx.manager, ctx.event.id, board, {
      team: ctx.teams[0].id,
      table: ctx.A.id,
      index: 0,
    })
    board = await move(ctx.manager, ctx.event.id, board, {
      team: ctx.teams[1].id,
      table: ctx.A.id,
      index: 1,
    })
    board = await move(ctx.manager, ctx.event.id, board, {
      team: ctx.teams[0].id,
      table: '',
      index: 0,
    })
    expect(order(board, ctx.A.id)).toEqual([['Team 2'], ['Team 2'], ['Team 2']])
    expect(board.games.filter((g) => g.team === ctx.teams[0].id).every((g) => !g.table)).toBe(true)
  })

  it('M8-T16: a table of another category refuses the team', async () => {
    const ctx = await setup(1)
    const board = await load(ctx.manager, ctx.event.id)
    const error = await expectDenied(
      move(ctx.manager, ctx.event.id, board, { team: ctx.teams[0].id, table: ctx.C.id, index: 0 }),
    )
    expect(error.status).toBe(400)
    expect(error.response.data?._error?.code).toBe('incompatible_category')
  })

  it('M8-T19: a move based on an outdated board gets 409', async () => {
    const ctx = await setup(2)
    const stale = await load(ctx.manager, ctx.event.id)
    const second = await fx.user({ roles: [{ role: 'event_manager', event: ctx.event.id }] })
    await move(second, ctx.event.id, stale, { team: ctx.teams[0].id, table: ctx.A.id, index: 0 })
    const fresh = await load(ctx.manager, ctx.event.id)
    // The first manager still has the old board: moving the same team conflicts.
    const status = await move(ctx.manager, ctx.event.id, stale, {
      team: ctx.teams[0].id,
      table: ctx.B.id,
      index: 0,
    }).then(
      () => 200,
      (e: ClientResponseError) => e.status,
    )
    expect(status).toBe(409)
    // Based on the fresh board it works.
    await move(ctx.manager, ctx.event.id, fresh, {
      team: ctx.teams[0].id,
      table: ctx.B.id,
      index: 0,
    })
  })

  it('keeps started games in place and orders the others around them', async () => {
    const ctx = await setup(3, 1)
    let board = await load(ctx.manager, ctx.event.id)
    for (const [i, team] of ctx.teams.entries()) {
      board = await move(ctx.manager, ctx.event.id, board, {
        team: team.id,
        table: ctx.A.id,
        index: i,
      })
    }
    const first = board.games.find((g) => g.team === ctx.teams[0].id)!
    await fx.su.collection('games').update(first.id, { status: 'absent' })
    board = await load(ctx.manager, ctx.event.id)
    board = await move(ctx.manager, ctx.event.id, board, {
      team: ctx.teams[2].id,
      table: ctx.A.id,
      index: 0,
    })
    const seq = (team: number) => board.games.find((g) => g.team === ctx.teams[team].id)!.sequence
    expect(seq(0)).toBe(1)
    expect([seq(2), seq(1)]).toEqual([2, 3])
  })

  it('M8-29: judges move between the tray and tables, within the category’s slots', async () => {
    const ctx = await setup(0)
    const judge = (body: Record<string, unknown>, board: Board) =>
      ctx.manager.pb.send<Board>(`/api/events/${ctx.event.id}/board/judges`, {
        method: 'POST',
        body: {
          ...body,
          expected: Object.fromEntries(board.tables.map((t) => [t.id, t.updated])),
        },
      })
    let board = await load(ctx.manager, ctx.event.id)
    board = await judge({ judge: ctx.judges[0].id, from: '', to: ctx.A.id }, board)
    board = await judge({ judge: ctx.judges[1].id, from: '', to: ctx.A.id }, board)
    expect(board.tables.find((t) => t.id === ctx.A.id)!.judges).toEqual([
      ctx.judges[0].id,
      ctx.judges[1].id,
    ])
    // Two slots by default: a third judge does not fit.
    await expectDenied(judge({ judge: ctx.judges[2].id, from: '', to: ctx.A.id }, board))
    await fx.su.collection('categories').update(ctx.category.id, { judges_per_table: 3 })
    board = await judge({ judge: ctx.judges[2].id, from: '', to: ctx.A.id }, board)
    // Move between tables, then back to the tray.
    board = await judge({ judge: ctx.judges[0].id, from: ctx.A.id, to: ctx.B.id }, board)
    expect(board.tables.find((t) => t.id === ctx.B.id)!.judges).toEqual([ctx.judges[0].id])
    board = await judge({ judge: ctx.judges[0].id, from: ctx.B.id, to: '' }, board)
    expect(board.tables.find((t) => t.id === ctx.B.id)!.judges).toEqual([])
    // Outsiders cannot be judges; stale versions conflict.
    const outsider = await fx.user()
    await expectDenied(judge({ judge: outsider.id, from: '', to: ctx.B.id }, board))
    const status = await ctx.manager.pb
      .send(`/api/events/${ctx.event.id}/board/judges`, {
        method: 'POST',
        body: { judge: ctx.judges[0].id, from: '', to: ctx.A.id, expected: { [ctx.A.id]: 'old' } },
      })
      .then(
        () => 200,
        (e: ClientResponseError) => e.status,
      )
    expect(status).toBe(409)
  })

  it('every judge of a table scores its games (M5 with several judges)', async () => {
    const ctx = await setup(1, 1)
    let board = await load(ctx.manager, ctx.event.id)
    board = await move(ctx.manager, ctx.event.id, board, {
      team: ctx.teams[0].id,
      table: ctx.A.id,
      index: 0,
    })
    await ctx.manager.pb.collection('tables').update(ctx.A.id, {
      judges: [ctx.judges[0].id, ctx.judges[1].id],
    })
    for (const judge of ctx.judges.slice(0, 2)) {
      const assignments = await judge.pb.send<unknown[]>('/api/judging/assignments', {})
      expect(assignments).toHaveLength(1)
    }
    expect(await ctx.judges[2].pb.send<unknown[]>('/api/judging/assignments', {})).toHaveLength(0)
  })

  it('M8-27, M8-T17: moving a table into another category asks first and frees its teams', async () => {
    const ctx = await setup(1, 2)
    let board = await load(ctx.manager, ctx.event.id)
    board = await move(ctx.manager, ctx.event.id, board, {
      team: ctx.teams[0].id,
      table: ctx.A.id,
      index: 0,
    })
    const table = board.tables.find((t) => t.id === ctx.A.id)!
    const send = (body: Record<string, unknown>) =>
      ctx.manager.pb.send<Board>(`/api/events/${ctx.event.id}/board/tables/${ctx.A.id}/category`, {
        method: 'POST',
        body: { category: ctx.other.id, expected_updated: table.updated, ...body },
      })
    const refused = await expectDenied(send({}))
    expect(refused.response.data?._error?.code).toBe('table_has_teams')
    board = await send({ confirm: true })
    expect(board.tables.find((t) => t.id === ctx.A.id)!.category).toBe(ctx.other.id)
    expect(board.games.every((g) => !g.table)).toBe(true)
  })

  it('M8-26: a new table goes to the end of its category group', async () => {
    const ctx = await setup(0, 1)
    let board = await ctx.manager.pb.send<Board>(`/api/events/${ctx.event.id}/board/tables`, {
      method: 'POST',
      body: { category: ctx.category.id },
    })
    expect(board.tables.map((t) => t.name)).toEqual(['A', 'B', 'Table 4', 'C'])
    // Moving the first table of the next group keeps groups contiguous.
    const c = board.tables.find((t) => t.name === 'C')!
    board = await ctx.manager.pb.send<Board>(
      `/api/events/${ctx.event.id}/board/tables/${c.id}/category`,
      { method: 'POST', body: { category: ctx.category.id, expected_updated: c.updated } },
    )
    expect(board.tables.map((t) => t.name)).toEqual(['A', 'B', 'Table 4', 'C'])
    expect(new Set(board.tables.map((t) => t.category))).toEqual(new Set([ctx.category.id]))
  })

  it('archived events are read-only on the board', async () => {
    const ctx = await setup(1, 1)
    const board = await load(ctx.manager, ctx.event.id)
    await fx.su.collection('events').update(ctx.event.id, { status: 'archived' })
    await expectDenied(
      move(ctx.manager, ctx.event.id, board, { team: ctx.teams[0].id, table: ctx.A.id, index: 0 }),
    )
  })
})
