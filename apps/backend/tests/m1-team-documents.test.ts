import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type PocketBase from 'pocketbase'
import type { RecordModel } from 'pocketbase'
import { startPocketBase, type TestServer } from './support/pocketbase'
import { expectDenied, expectFieldError, Fixtures, type TestUser } from './support/fixtures'

// M1-13 team documents and M5-15 robot check in the judge schedule
// (docs/specifications/M1-teams.md, docs/specifications/M5-judging.md).

interface Ctx {
  event: RecordModel
  team: RecordModel
  manager: TestUser
  headJudge: TestUser
  judge: TestUser
  formerCoach: TestUser
  otherManager: TestUser
}

const pdf = (name = 'robot.pdf') =>
  new File([new Blob(['%PDF-1.4 test'], { type: 'application/pdf' })], name, {
    type: 'application/pdf',
  })

function upload(pb: PocketBase, team: string, title = 'Robot description', file = pdf()) {
  const data = new FormData()
  data.append('team', team)
  data.append('title', title)
  data.append('file', file)
  return pb.collection('team_documents').create(data)
}

describe('M1-13 team documents', () => {
  let server: TestServer
  let fx: Fixtures

  beforeAll(async () => {
    server = await startPocketBase()
    fx = await Fixtures.create(server)
  })
  afterAll(() => server?.dispose())

  async function setup(): Promise<Ctx> {
    const event = await fx.event()
    const other = await fx.event()
    const category = await fx.category(event.id)
    const manager = await fx.user({ roles: [{ role: 'event_manager', event: event.id }] })
    const headJudge = await fx.user({ roles: [{ role: 'head_judge', event: event.id }] })
    const judge = await fx.user({ roles: [{ role: 'judge', event: event.id }] })
    const otherManager = await fx.user({ roles: [{ role: 'event_manager', event: other.id }] })
    // Linked to the team before the coach role was retired (M8-A): no access any more.
    const formerCoach = await fx.user()
    const team = await fx.team(event.id, category.id, { coach: formerCoach.id, status: 'approved' })
    return { event, team, manager, headJudge, judge, formerCoach, otherManager }
  }

  async function download(user: TestUser, doc: RecordModel) {
    const token = await user.pb.files.getToken()
    const url = user.pb.files.getURL(doc, doc.file as string, { token })
    return fetch(url)
  }

  it('M1-T13a: an event manager uploads a document; the server records the uploader', async () => {
    const ctx = await setup()
    const doc = await upload(ctx.manager.pb, ctx.team.id)
    expect(doc.title).toBe('Robot description')
    expect(doc.file).toMatch(/^robot.*\.pdf$/)
    expect(doc.uploaded_by).toBe(ctx.manager.id)
  })

  it('M1-T13b: judges, outsiders and other events’ managers cannot upload, change or delete', async () => {
    const ctx = await setup()
    for (const user of [ctx.formerCoach, ctx.judge, ctx.headJudge, ctx.otherManager]) {
      await expectDenied(upload(user.pb, ctx.team.id))
    }
    const doc = await upload(ctx.manager.pb, ctx.team.id)
    for (const user of [ctx.formerCoach, ctx.judge, ctx.headJudge]) {
      await expectDenied(user.pb.collection('team_documents').update(doc.id, { title: 'x' }))
      await expectDenied(user.pb.collection('team_documents').delete(doc.id))
    }
  })

  it('M1-T13c: all event staff see the documents and download the file', async () => {
    const ctx = await setup()
    const doc = await upload(ctx.manager.pb, ctx.team.id)
    for (const user of [ctx.judge, ctx.headJudge, ctx.manager]) {
      const list = await user.pb
        .collection('team_documents')
        .getFullList({ filter: `team = "${ctx.team.id}"` })
      expect(list.map((d) => d.id)).toEqual([doc.id])
      const res = await download(user, doc)
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('%PDF-1.4 test')
    }
  })

  it('M1-T13d / M8-T02: outsiders, formerly linked accounts and other events’ staff see neither records nor files', async () => {
    const ctx = await setup()
    const doc = await upload(ctx.manager.pb, ctx.team.id)
    for (const user of [ctx.formerCoach, await fx.user(), ctx.otherManager]) {
      const list = await user.pb.collection('team_documents').getFullList()
      expect(list.map((d) => d.id)).not.toContain(doc.id)
      await expectDenied(user.pb.collection('team_documents').getOne(doc.id))
      expect((await download(user, doc)).status).toBe(404)
    }
    // Without a file token the protected file is never served.
    const plain = await fetch(ctx.manager.pb.files.getURL(doc, doc.file as string))
    expect(plain.status).toBe(404)
  })

  it('M1-T13e: the uploader cannot be forged and the team cannot change', async () => {
    const ctx = await setup()
    const data = new FormData()
    data.append('team', ctx.team.id)
    data.append('title', 'Forged')
    data.append('file', pdf())
    data.append('uploaded_by', ctx.formerCoach.id)
    const doc = await ctx.manager.pb.collection('team_documents').create(data)
    expect(doc.uploaded_by).toBe(ctx.manager.id)
    await expectDenied(
      ctx.manager.pb
        .collection('team_documents')
        .update(doc.id, { uploaded_by: ctx.formerCoach.id }),
    )
    const other = await fx.team(ctx.event.id, (ctx.team.category as string) ?? '', {
      status: 'approved',
    })
    await expectDenied(
      ctx.manager.pb.collection('team_documents').update(doc.id, { team: other.id }),
    )
    // Title and file can be replaced.
    const renamed = await ctx.manager.pb
      .collection('team_documents')
      .update(doc.id, { title: 'Robot description v2' })
    expect(renamed.title).toBe('Robot description v2')
  })

  it('M1-T13f: file type and title are validated', async () => {
    const ctx = await setup()
    const exe = new File([new Blob(['MZ'], { type: 'application/x-msdownload' })], 'x.exe', {
      type: 'application/x-msdownload',
    })
    await expectFieldError(upload(ctx.manager.pb, ctx.team.id, 'Program', exe), 'file')
    await expectFieldError(upload(ctx.manager.pb, ctx.team.id, ''), 'title')
  })

  it('M1-T13g: documents of archived events are read-only; deleting the team removes them', async () => {
    const ctx = await setup()
    const doc = await upload(ctx.manager.pb, ctx.team.id)
    await fx.su.collection('events').update(ctx.event.id, { status: 'archived' })
    await expectDenied(upload(ctx.manager.pb, ctx.team.id))
    await expectDenied(ctx.manager.pb.collection('team_documents').delete(doc.id))
    await fx.su.collection('events').update(ctx.event.id, { status: 'published' })

    await ctx.manager.pb.collection('team_documents').delete(doc.id)
    const again = await upload(ctx.manager.pb, ctx.team.id)
    await fx.su.collection('teams').delete(ctx.team.id)
    await expectDenied(fx.su.collection('team_documents').getOne(again.id))
  })
})

describe('M5-15 robot check in the judge schedule', () => {
  let server: TestServer
  let fx: Fixtures

  beforeAll(async () => {
    server = await startPocketBase()
    fx = await Fixtures.create(server)
  })
  afterAll(() => server?.dispose())

  interface Row {
    team: { id: string }
    round: { id: string }
    check: {
      day: { id: string; label: string } | null
      starts_at: string
      duration_minutes: number
    } | null
  }

  it('M5-T15: assignments carry the round’s robot check, placed or not', async () => {
    const event = await fx.event()
    const category = await fx.category(event.id)
    const manager = await fx.user({ roles: [{ role: 'event_manager', event: event.id }] })
    const judge = await fx.user({ roles: [{ role: 'judge', event: event.id }] })
    const day = await manager.pb
      .collection('competition_days')
      .create({ event: event.id, date: '2026-06-13', label: 'Saturday' })
    const round = await manager.pb.collection('rounds').create({
      category: category.id,
      key: 'R1',
      name: 'Round 1',
      position: 1,
      testing_minutes: 0,
      scoring_minutes: 10,
      day: day.id,
    })
    const table = await manager.pb
      .collection('tables')
      .create({ event: event.id, name: 'Table A', active: true, judges: [judge.id] })
    const team = await fx.team(event.id, category.id, { status: 'approved' })
    await manager.pb
      .collection('games')
      .create({ round: round.id, team: team.id, status: 'scheduled', table: table.id, sequence: 1 })

    const rows = () => judge.pb.send<Row[]>('/api/judging/assignments', { method: 'GET' })
    expect((await rows())[0]!.check).toBeNull()

    const check = await manager.pb
      .collection('round_phases')
      .create({ round: round.id, phase: 'check', duration_minutes: 10 })
    expect((await rows())[0]!.check).toEqual({ day: null, starts_at: '', duration_minutes: 10 })

    await manager.pb.collection('round_phases').update(check.id, {
      day: day.id,
      starts_at: '08:30',
      duration_minutes: 15,
      expected_updated: check.updated,
    })
    const placed = (await rows())[0]!.check!
    expect(placed.day?.label).toBe('Saturday')
    expect(placed.starts_at).toBe('08:30')
    expect(placed.duration_minutes).toBe(15)
  })
})
