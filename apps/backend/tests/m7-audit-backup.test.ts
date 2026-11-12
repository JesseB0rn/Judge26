import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { RecordModel } from 'pocketbase'
import { startPocketBase, type TestServer } from './support/pocketbase'
import { expectDenied, Fixtures, mailsTo, validMembers, type TestUser } from './support/fixtures'

// M7-08 – M7-10, M7-T07, M7-T08, M7-T11 (docs/specifications/M7-audit-backup-security.md).

interface AuditEntry extends RecordModel {
  actor: string
  actor_label: string
  action: string
  collection: string
  record: string
  event: string
  summary: string
  changes: Record<string, unknown> | null
  ip: string
}

describe('M7 audit log', () => {
  let server: TestServer
  let fx: Fixtures
  let admin: TestUser

  beforeAll(async () => {
    server = await startPocketBase()
    fx = await Fixtures.create(server)
    admin = await fx.admin()
  })
  afterAll(() => server?.dispose())

  const entriesFor = (record: string) =>
    fx.su
      .collection('audit_log')
      .getFullList<AuditEntry>({ filter: `record = "${record}"`, sort: 'created' })

  async function eventWithManager() {
    const event = await fx.event({ name: 'Audit Open' })
    const category = await fx.category(event.id)
    const manager = await fx.user({ roles: [{ role: 'event_manager', event: event.id }] })
    return { event, category, manager }
  }

  it('M7-08: records who changed what, with the changed fields', async () => {
    const { event, category, manager } = await eventWithManager()
    const team = await manager.pb.collection('teams').create({
      event: event.id,
      category: category.id,
      name: 'Robo Rangers',
      status: 'approved',
      members: validMembers(),
    })
    await admin.pb.collection('teams').update(team.id, { status: 'withdrawn' })

    const [created, withdrawn] = await entriesFor(team.id)
    expect(created).toMatchObject({
      action: 'create',
      collection: 'teams',
      event: event.id,
      actor: manager.id,
      actor_label: manager.email,
      summary: 'Created team “Robo Rangers”',
    })
    // Personal data is not copied into the log.
    expect(created!.changes).toMatchObject({ name: 'Robo Rangers', members: '[set]' })
    expect(JSON.stringify(created!.changes)).not.toContain('Lovelace')
    expect(withdrawn).toMatchObject({
      action: 'update',
      actor: admin.id,
      summary: 'Updated team “Robo Rangers”: status approved → withdrawn',
    })
    expect(withdrawn!.changes).toMatchObject({ status: ['approved', 'withdrawn'] })
    expect(withdrawn!.ip).toBeTruthy()
  })

  it('records deletions and admin role changes; unchanged saves are not logged', async () => {
    const { event } = await eventWithManager()
    const user = await fx.user()
    const role = await admin.pb
      .collection('role_assignments')
      .create({ user: user.id, role: 'judge', event: event.id })
    await admin.pb.collection('role_assignments').delete(role.id)
    const day = await admin.pb
      .collection('competition_days')
      .create({ event: event.id, date: '2026-06-01', label: 'Day 1' })
    await admin.pb.collection('competition_days').update(day.id, { label: 'Day 1' })

    expect((await entriesFor(role.id)).map((e) => [e.action, e.actor])).toEqual([
      ['create', admin.id],
      ['delete', admin.id],
    ])
    const [deleted] = (await entriesFor(role.id)).slice(1)
    expect(deleted!.changes).toMatchObject({ role: 'judge', user: user.id })
    expect((await entriesFor(day.id)).map((e) => e.action)).toEqual(['create'])
  })

  it('superusers and server actions are named', async () => {
    const { event, category, manager } = await eventWithManager()
    await fx.su.collection('categories').update(category.id, { name: 'RoboMission Senior' })
    const entry = (await entriesFor(category.id)).find((e) => e.action === 'update')
    expect(entry!.changes).toEqual({ name: ['RoboMission Junior', 'RoboMission Senior'] })
    expect(entry).toMatchObject({ actor: '', actor_label: 'superuser superuser@test.local' })

    await manager.pb.collection('categories').update(category.id, {
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
    const [published] = await entriesFor(snapshot.id)
    expect(published).toMatchObject({
      action: 'create',
      collection: 'ranking_snapshots',
      event: event.id,
      actor: manager.id,
      summary: 'Published ranking snapshot “Official” of RoboMission Senior',
    })
    // Bulky configuration values are not copied.
    const configured = (await entriesFor(category.id)).find((e) => e.actor === manager.id)
    expect(configured!.summary).toBe('Updated category “RoboMission Senior”: ranking')
    expect(configured!.changes).toEqual({ ranking: ['[changed]', '[changed]'] })
  })

  it('the log is read-only; admins read all, managers their events only', async () => {
    const a = await eventWithManager()
    const b = await eventWithManager()
    await a.manager.pb.collection('categories').update(a.category.id, { name: 'A changed' })
    await b.manager.pb.collection('categories').update(b.category.id, { name: 'B changed' })
    const judge = await fx.user({ roles: [{ role: 'judge', event: a.event.id }] })

    const seenBy = async (user: TestUser) =>
      (await user.pb.collection('audit_log').getFullList<AuditEntry>()).map((e) => e.event)
    expect(new Set(await seenBy(a.manager))).toEqual(new Set([a.event.id]))
    expect(await seenBy(admin)).toEqual(expect.arrayContaining([a.event.id, b.event.id]))
    expect(await seenBy(judge)).toEqual([])
    expect(await server.client().collection('audit_log').getFullList()).toEqual([])

    const [entry] = await entriesFor(a.category.id)
    await expectDenied(admin.pb.collection('audit_log').update(entry!.id, { summary: 'x' }))
    await expectDenied(admin.pb.collection('audit_log').delete(entry!.id))
    await expectDenied(admin.pb.collection('audit_log').create({ action: 'create' }))
  })
})

describe('M7 backup and recovery', () => {
  let server: TestServer
  let fx: Fixtures

  beforeAll(async () => {
    server = await startPocketBase()
    fx = await Fixtures.create(server)
  })
  afterAll(() => server?.dispose())

  async function downloadBackup(name: string) {
    const token = await fx.su.files.getToken()
    const res = await fetch(`${server.url}/api/backups/${name}?token=${token}`)
    expect(res.status).toBe(200)
    const path = join(mkdtempSync(join(tmpdir(), 'judge26-backup-')), name)
    writeFileSync(path, Buffer.from(await res.arrayBuffer()))
    return path
  }

  async function competition() {
    const event = await fx.event({ name: 'Backup Cup' })
    const category = await fx.category(event.id)
    const manager = await fx.user({ roles: [{ role: 'event_manager', event: event.id }] })
    const judge = await fx.user({ roles: [{ role: 'judge', event: event.id }] })
    const round = await manager.pb.collection('rounds').create({
      category: category.id,
      key: 'R1',
      name: 'Round 1',
      position: 1,
      testing_minutes: 0,
      scoring_minutes: 10,
    })
    const table = await manager.pb
      .collection('tables')
      .create({ event: event.id, name: 'Table A', active: true, judges: [judge.id] })
    const team = await fx.team(event.id, category.id, { status: 'approved', name: 'Keepers' })
    const game = await manager.pb.collection('games').create({
      round: round.id,
      team: team.id,
      status: 'completed',
      points: 140,
      time_ms: 75_000,
      table: table.id,
      sequence: 1,
    })
    return { event, category, manager, judge, round, table, team, game }
  }

  it('M7-09 / M7-T07: a backup is a valid archive of the database and files', async () => {
    await competition()
    await fx.su.backups.create('t07.zip')
    const list = await fx.su.backups.getFullList()
    expect(list.map((b) => b.key)).toContain('t07.zip')

    const path = await downloadBackup('t07.zip')
    expect(readFileSync(path).subarray(0, 2).toString()).toBe('PK')
    const entries = execFileSync('unzip', ['-Z1', path], { encoding: 'utf8' }).split('\n')
    expect(entries).toEqual(expect.arrayContaining(['data.db', 'auxiliary.db']))
    // The database inside is a complete SQLite file.
    const header = execFileSync('unzip', ['-p', path, 'data.db']).subarray(0, 16).toString()
    expect(header).toBe('SQLite format 3\u0000')
    execFileSync('unzip', ['-tq', path]) // CRC check of every entry

    // Backups are recorded in the audit log.
    const log = await fx.su
      .collection('audit_log')
      .getFullList({ filter: 'action ~ "backup.create"', sort: 'created' })
    expect(log.map((e) => e.action)).toEqual(['backup.create', 'backup.create_requested'])
    expect(log[1]!.actor_label).toBe('superuser superuser@test.local')
  })

  it('only superusers can create, list, download or restore backups', async () => {
    const admin = await fx.admin()
    await expectDenied(admin.pb.backups.getFullList())
    await expectDenied(admin.pb.backups.create('nope.zip'))
    await expectDenied(admin.pb.backups.restore('t07.zip'))
    await expectDenied(server.client().backups.getFullList())
    const res = await fetch(`${server.url}/api/backups/t07.zip`)
    expect(res.status).toBeGreaterThanOrEqual(400)
  })

  it('M7-10 / M7-T08: restoring a backup preserves records and relationships', async () => {
    const ctx = await competition()
    const before = await fx.su
      .collection('games')
      .getOne(ctx.game.id, { expand: 'round,team,table' })
    await fx.su.backups.create('t08.zip')

    // Changes after the backup: they must be gone after the restore.
    await fx.su.collection('events').update(ctx.event.id, { name: 'Renamed' })
    await fx.su.collection('teams').delete(ctx.team.id) // cascades to its game
    const later = await fx.event({ name: 'Created after backup' })

    await fx.su.backups.restore('t08.zip')
    // The server restarts with the restored data.
    const deadline = Date.now() + 20_000
    let restored: RecordModel | null = null
    while (Date.now() < deadline && !restored) {
      await new Promise((r) => setTimeout(r, 250))
      try {
        const su = await server.superuserClient()
        restored = await su.collection('games').getOne(ctx.game.id, { expand: 'round,team,table' })
        fx = new Fixtures(server, su)
      } catch {
        restored = null
      }
    }
    expect(restored, 'the game is back after the restore').toBeTruthy()
    expect(restored).toMatchObject({ points: 140, time_ms: 75_000, status: 'completed' })
    expect(restored!.expand).toMatchObject({
      round: { id: ctx.round.id, category: ctx.category.id },
      team: { id: ctx.team.id, name: 'Keepers', event: ctx.event.id },
      table: { id: ctx.table.id, judges: [ctx.judge.id] },
    })
    expect(restored!.updated).toBe(before.updated)
    expect((await fx.su.collection('events').getOne(ctx.event.id)).name).toBe('Backup Cup')
    await expectDenied(fx.su.collection('events').getOne(later.id))
    // Accounts and roles work again: the manager can sign in and manage the event.
    const manager = server.client()
    await manager.collection('users').authWithPassword(ctx.manager.email, 'password-1234')
    expect((await manager.collection('rounds').getOne(ctx.round.id)).name).toBe('Round 1')

    // The restore itself is in the (restored) audit log.
    const entry = await fx.su.collection('audit_log').getFirstListItem('action = "backup.restore"')
    expect(entry.summary).toContain('t08.zip')
  })
})

describe('M7-T11 server restart', () => {
  it('the application recovers: data kept, queued emails delivered after the restart', async () => {
    let server = await startPocketBase()
    const dataDir = server.dataDir
    try {
      let fx = await Fixtures.create(server)
      const post = (path: string, body: unknown) =>
        fetch(`${server.url}${path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      const { team, email, notify } = await fx.scheduledTeam()
      await post('/api/dev/mail-failures', { count: 1 })
      await notify()
      await post('/api/dev/mail-outbox/process', { now: 0 })
      expect(await mailsTo(server, email)).toHaveLength(0) // failed, queued for a retry

      await server.stop()
      server = await startPocketBase({ dataDir })
      fx = await Fixtures.create(server)
      expect((await fx.su.collection('teams').getOne(team.id)).status).toBe('approved')
      const [queued] = await fx.su
        .collection('mail_outbox')
        .getFullList({ filter: `to = "${email}"` })
      expect(queued).toMatchObject({ status: 'pending', attempts: 1 })

      await fetch(`${server.url}/api/dev/mail-outbox/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ now: Date.now() + 2 * 60_000 }),
      })
      expect((await mailsTo(server, email)).map((m) => m.subject)).toEqual([
        `Schedule for ${team.name} at ${(await fx.su.collection('events').getOne(team.event)).name}`,
      ])
    } finally {
      await server.dispose()
    }
  })
})
