import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import type { ClientResponseError, RecordModel } from 'pocketbase'
import { startPocketBase, type TestServer } from './support/pocketbase'
import { expectDenied, Fixtures, type TestUser } from './support/fixtures'

// M10-D and M10-E: planner editing and the assignment board (trial run feedback).
// See docs/specifications/M4-tables-and-scheduling.md and docs/specifications/M8-board.md.

interface Board {
  table_labels: string
  rounds: { id: string; category: string }[]
  tables: { id: string; name: string; category: string; updated: string }[]
  teams: { id: string; name: string; category: string }[]
  games: {
    id: string
    round: string
    team: string
    table: string
    sequence: number
    updated: string
  }[]
}

describe('M10 board and planner', () => {
  let server: TestServer
  let fx: Fixtures

  beforeAll(async () => {
    server = await startPocketBase()
    fx = await Fixtures.create(server)
  })
  afterAll(() => server?.dispose())

  async function boardSetup(teams = 3) {
    const event = await fx.event()
    const category = await fx.category(event.id, { code: 'RM1' })
    const other = await fx.category(event.id, { code: 'RM2' })
    const manager = await fx.user({ roles: [{ role: 'event_manager', event: event.id }] })
    for (const [i, cat] of [category, other].entries()) {
      await manager.pb.collection('rounds').create({
        category: cat.id,
        key: `R${i}`,
        name: 'Round 1',
        position: 1,
        testing_minutes: 0,
        scoring_minutes: 30,
      })
    }
    const teamRecords: RecordModel[] = []
    for (let i = 0; i < teams; i++) {
      teamRecords.push(
        await fx.team(event.id, category.id, { name: `Team ${i + 1}`, status: 'approved' }),
      )
    }
    const stranger = await fx.team(event.id, other.id, { name: 'Other', status: 'approved' })
    return { event, category, other, manager, teams: teamRecords, stranger }
  }

  const load = (user: TestUser, eventId: string) =>
    user.pb.send<Board>(`/api/events/${eventId}/board`, {})
  const addTable = (user: TestUser, eventId: string, category: string) =>
    user.pb.send<Board>(`/api/events/${eventId}/board/tables`, {
      method: 'POST',
      body: { category },
    })
  const setLabels = (user: TestUser, eventId: string, body: Record<string, unknown>) =>
    user.pb.send<Board>(`/api/events/${eventId}/board/labels`, { method: 'POST', body })

  const expectedTables = (board: Board) =>
    Object.fromEntries(board.tables.map((t) => [t.id, t.updated]))

  /** Status and error code of a refused request (including 409, unlike expectDenied). */
  async function code(promise: Promise<unknown>) {
    const error = (await promise.then(
      () => expect.unreachable('expected the request to be refused'),
      (e: unknown) => e,
    )) as ClientResponseError
    return {
      status: error.status,
      code: (error.response.data as { _error?: { code: string } })._error?.code,
    }
  }

  describe('M10-25 table label scheme', () => {
    it('M10-T39: new tables get the next label; relabel all renames in board order', async () => {
      const ctx = await boardSetup(0)
      let board = await load(ctx.manager, ctx.event.id)
      expect(board.table_labels).toBe('table_number')

      board = await setLabels(ctx.manager, ctx.event.id, { scheme: 'letter' })
      expect(board.table_labels).toBe('letter')
      board = await addTable(ctx.manager, ctx.event.id, ctx.category.id)
      board = await addTable(ctx.manager, ctx.event.id, ctx.category.id)
      board = await addTable(ctx.manager, ctx.event.id, ctx.other.id)
      expect(board.tables.map((t) => t.name)).toEqual(['A', 'B', 'C'])

      // A hand-renamed table keeps its name until relabelled.
      const b = board.tables[1]!
      await ctx.manager.pb
        .collection('tables')
        .update(b.id, { name: 'Center', expected_updated: b.updated })
      board = await load(ctx.manager, ctx.event.id)
      expect(board.tables.map((t) => t.name)).toEqual(['A', 'Center', 'C'])

      board = await setLabels(ctx.manager, ctx.event.id, {
        scheme: 'table_number',
        relabel: true,
        expected: expectedTables(board),
      })
      expect(board.table_labels).toBe('table_number')
      expect(board.tables.map((t) => t.name)).toEqual(['Table 1', 'Table 2', 'Table 3'])

      // Swapping names works despite the unique (event, name) index.
      board = await setLabels(ctx.manager, ctx.event.id, {
        scheme: 'number',
        relabel: true,
        expected: expectedTables(board),
      })
      expect(board.tables.map((t) => t.name)).toEqual(['1', '2', '3'])
    })

    it('M10-T39: lettered labels continue with AA after Z', async () => {
      const ctx = await boardSetup(0)
      await setLabels(ctx.manager, ctx.event.id, { scheme: 'table_letter' })
      let board = await load(ctx.manager, ctx.event.id)
      for (let i = 0; i < 27; i++)
        board = await addTable(ctx.manager, ctx.event.id, ctx.category.id)
      expect(board.tables.slice(24).map((t) => t.name)).toEqual(['Table Y', 'Table Z', 'Table AA'])
    })

    it('M10-25: the word in the label follows the manager’s language', async () => {
      const ctx = await boardSetup(0)
      await fx.su.collection('users').update(ctx.manager.id, { language: 'de' })
      await ctx.manager.pb.collection('users').authRefresh()
      let board = await addTable(ctx.manager, ctx.event.id, ctx.category.id)
      expect(board.tables.map((t) => t.name)).toEqual(['Tisch 1'])
      board = await setLabels(ctx.manager, ctx.event.id, {
        scheme: 'table_letter',
        relabel: true,
        expected: expectedTables(board),
      })
      expect(board.tables.map((t) => t.name)).toEqual(['Tisch A'])
    })

    it('M10-25: a stale relabel is refused; bad schemes and non-managers are rejected', async () => {
      const ctx = await boardSetup(0)
      let board = await addTable(ctx.manager, ctx.event.id, ctx.category.id)
      board = await addTable(ctx.manager, ctx.event.id, ctx.category.id)
      const stale = expectedTables(board)
      const first = board.tables[0]!
      await ctx.manager.pb
        .collection('tables')
        .update(first.id, { name: 'Renamed', expected_updated: first.updated })
      expect(
        await code(
          setLabels(ctx.manager, ctx.event.id, {
            scheme: 'number',
            relabel: true,
            expected: stale,
          }),
        ),
      ).toEqual({ status: 409, code: 'changed_meanwhile' })
      board = await load(ctx.manager, ctx.event.id)
      expect(board.tables.map((t) => t.name)).toEqual(['Renamed', 'Table 2'])
      expect(board.table_labels).toBe('table_number')

      expect(await code(setLabels(ctx.manager, ctx.event.id, { scheme: 'roman' }))).toEqual({
        status: 400,
        code: 'invalid_scheme',
      })
      const judge = await fx.user({ roles: [{ role: 'judge', event: ctx.event.id }] })
      await expectDenied(setLabels(judge, ctx.event.id, { scheme: 'letter' }))
    })

    it('M10-25: event templates carry the scheme', async () => {
      const ctx = await boardSetup(0)
      await setLabels(ctx.manager, ctx.event.id, { scheme: 'table_letter' })
      const admin = await fx.admin()
      const template = await admin.pb.send<{ event: { table_labels: string } }>(
        `/api/events/${ctx.event.id}/template`,
        { method: 'GET' },
      )
      expect(template.event.table_labels).toBe('table_letter')
      const stored = await admin.pb.send<RecordModel>('/api/event-templates', {
        method: 'POST',
        body: { content: JSON.stringify(template), name: 'Lettered' },
      })
      const created = await admin.pb.send<RecordModel>(`/api/event-templates/${stored.id}/events`, {
        method: 'POST',
        body: { name: 'From template', first_day: '2027-05-15' },
      })
      expect(created.table_labels).toBe('table_letter')

      // Files without the field (exported before M10) still load with the default.
      delete (template.event as Partial<typeof template.event>).table_labels
      const old = await admin.pb.send<RecordModel>('/api/event-templates', {
        method: 'POST',
        body: { content: JSON.stringify(template), name: 'Old' },
      })
      const fromOld = await admin.pb.send<RecordModel>(`/api/event-templates/${old.id}/events`, {
        method: 'POST',
        body: { name: 'From old template', first_day: '2027-05-15' },
      })
      expect(fromOld.table_labels).toBe('table_number')
    })
  })

  describe('M10-28 placing several teams at once', () => {
    /** Versions of every game of the moved teams and of the target table (the client's view). */
    function expectedFor(board: Board, teams: string[], table: string) {
      return Object.fromEntries(
        board.games
          .filter((g) => teams.includes(g.team) || g.table === table)
          .map((g) => [g.id, g.updated]),
      )
    }

    const order = (board: Board, table: string) =>
      board.games
        .filter((g) => g.table === table)
        .sort((a, b) => a.sequence - b.sequence)
        .map((g) => board.teams.find((t) => t.id === g.team)!.name)

    it('M10-T42: selected teams are placed from the drop position in the given order', async () => {
      const ctx = await boardSetup(4)
      let board = await addTable(ctx.manager, ctx.event.id, ctx.category.id)
      const table = board.tables[0]!.id
      board = await ctx.manager.pb.send<Board>(`/api/events/${ctx.event.id}/board/teams`, {
        method: 'POST',
        body: { team: ctx.teams[3]!.id, table, index: 0, expected: {} },
      })
      const ids = [ctx.teams[0]!.id, ctx.teams[1]!.id, ctx.teams[2]!.id]
      board = await ctx.manager.pb.send<Board>(`/api/events/${ctx.event.id}/board/teams`, {
        method: 'POST',
        body: { teams: ids, table, index: 0, expected: expectedFor(board, ids, table) },
      })
      expect(order(board, table)).toEqual(['Team 1', 'Team 2', 'Team 3', 'Team 4'])
      const audit = await fx.su
        .collection('audit_log')
        .getFullList({ filter: `event = "${ctx.event.id}" && action = "board.move_team"` })
      expect(audit.some((a) => /Placed 3 teams/.test(a.summary as string))).toBe(true)
    })

    it('M10-T43: if one team belongs to another category, nothing is placed', async () => {
      const ctx = await boardSetup(2)
      let board = await addTable(ctx.manager, ctx.event.id, ctx.category.id)
      const table = board.tables[0]!.id
      const ids = [ctx.teams[0]!.id, ctx.stranger.id, ctx.teams[1]!.id]
      expect(
        await code(
          ctx.manager.pb.send(`/api/events/${ctx.event.id}/board/teams`, {
            method: 'POST',
            body: { teams: ids, table, index: 0, expected: expectedFor(board, ids, table) },
          }),
        ),
      ).toEqual({ status: 400, code: 'incompatible_category' })
      board = await load(ctx.manager, ctx.event.id)
      expect(board.games.filter((g) => g.table)).toEqual([])
    })

    it('M10-28: a stale multi-placement gets 409 and changes nothing', async () => {
      const ctx = await boardSetup(2)
      let board = await addTable(ctx.manager, ctx.event.id, ctx.category.id)
      const table = board.tables[0]!.id
      const ids = [ctx.teams[0]!.id, ctx.teams[1]!.id]
      const stale = expectedFor(board, ids, table)
      await ctx.manager.pb.send(`/api/events/${ctx.event.id}/board/teams`, {
        method: 'POST',
        body: { team: ctx.teams[0]!.id, table, index: 0, expected: stale },
      })
      expect(
        await code(
          ctx.manager.pb.send(`/api/events/${ctx.event.id}/board/teams`, {
            method: 'POST',
            body: { teams: ids, table, index: 0, expected: stale },
          }),
        ),
      ).toEqual({ status: 409, code: 'changed_meanwhile' })
      board = await load(ctx.manager, ctx.event.id)
      expect(order(board, table)).toEqual(['Team 1'])
    })
  })

  describe('M10-D planner', () => {
    async function plannerSetup() {
      const event = await fx.event()
      const category = await fx.category(event.id)
      const manager = await fx.user({ roles: [{ role: 'event_manager', event: event.id }] })
      const day = await fx.su
        .collection('competition_days')
        .create({ event: event.id, date: '2026-06-01', label: 'Day 1' })
      return { event, category, manager, day }
    }

    interface Planner {
      days: { id: string; starts_at: string; ends_at: string; updated?: string }[]
      issues: { code: string; items: { kind: string; id: string }[] }[]
    }
    const planner = (user: TestUser, eventId: string) =>
      user.pb.send<Planner>(`/api/events/${eventId}/planner`, { method: 'GET' })

    it('M10-T33: day times are versioned; items outside are flagged, not moved', async () => {
      const ctx = await plannerSetup()
      const block = await ctx.manager.pb.collection('schedule_blocks').create({
        event: ctx.event.id,
        day: ctx.day.id,
        starts_at: '08:30',
        duration_minutes: 30,
        title: 'Welcome',
        public: true,
      })
      let data = await planner(ctx.manager, ctx.event.id)
      const loaded = data.days[0]!
      expect(loaded.updated).toBeTruthy()

      await ctx.manager.pb.collection('competition_days').update(ctx.day.id, {
        starts_at: '09:00',
        ends_at: '17:00',
        expected_updated: loaded.updated,
      })
      data = await planner(ctx.manager, ctx.event.id)
      expect([data.days[0]!.starts_at, data.days[0]!.ends_at]).toEqual(['09:00', '17:00'])
      expect(
        data.issues.some((i) => i.code === 'outside_day' && i.items.some((x) => x.id === block.id)),
      ).toBe(true)
      const stored = await fx.su.collection('schedule_blocks').getOne(block.id)
      expect(stored.starts_at).toBe('08:30')

      // A write based on the old version is refused.
      expect(
        await code(
          ctx.manager.pb.collection('competition_days').update(ctx.day.id, {
            starts_at: '07:00',
            expected_updated: loaded.updated,
          }),
        ),
      ).toEqual({ status: 409, code: 'changed_meanwhile' })
      // Editors without a version (the event's day list) are not checked.
      await ctx.manager.pb.collection('competition_days').update(ctx.day.id, { label: 'Saturday' })
    })

    it('M10-21: the public planner does not expose day versions', async () => {
      const ctx = await plannerSetup()
      const visitor = await fx.user()
      const data = await planner(visitor, ctx.event.id)
      expect(data.days[0]!.updated).toBeUndefined()
    })

    it('M10-T38: a "move later" shift is one write: one stale item refuses all of it', async () => {
      const ctx = await plannerSetup()
      const make = (starts_at: string) =>
        ctx.manager.pb.collection('schedule_blocks').create({
          event: ctx.event.id,
          day: ctx.day.id,
          starts_at,
          duration_minutes: 30,
          title: starts_at,
          categories: [ctx.category.id],
          public: true,
        })
      const a = await make('10:00')
      const b = await make('11:00')
      // b changes meanwhile.
      await ctx.manager.pb
        .collection('schedule_blocks')
        .update(b.id, { title: 'Changed', expected_updated: b.updated })

      const batch = ctx.manager.pb.createBatch()
      batch
        .collection('schedule_blocks')
        .update(a.id, { starts_at: '10:15', expected_updated: a.updated })
      batch
        .collection('schedule_blocks')
        .update(b.id, { starts_at: '11:15', expected_updated: b.updated })
      const refused = (await expectDenied(batch.send())) as ClientResponseError
      // The web app recognises the stale item in the batch error (shown as a conflict).
      expect(JSON.stringify(refused.response)).toContain('changed_meanwhile')
      const stored = await fx.su
        .collection('schedule_blocks')
        .getFullList({ filter: `event = "${ctx.event.id}"`, sort: 'starts_at' })
      expect(stored.map((s) => s.starts_at)).toEqual(['10:00', '11:00'])

      // With current versions the whole shift is saved.
      const fresh = await fx.su.collection('schedule_blocks').getOne(b.id)
      const ok = ctx.manager.pb.createBatch()
      ok.collection('schedule_blocks').update(a.id, {
        starts_at: '10:15',
        expected_updated: a.updated,
      })
      ok.collection('schedule_blocks').update(b.id, {
        starts_at: '11:15',
        expected_updated: fresh.updated,
      })
      await ok.send()
      const after = await fx.su
        .collection('schedule_blocks')
        .getFullList({ filter: `event = "${ctx.event.id}"`, sort: 'starts_at' })
      expect(after.map((s) => s.starts_at)).toEqual(['10:15', '11:15'])
    })
  })
})
