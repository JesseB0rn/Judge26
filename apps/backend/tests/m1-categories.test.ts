import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { RecordModel } from 'pocketbase'
import { startPocketBase, type TestServer } from './support/pocketbase'
import { expectDenied, expectFieldError, Fixtures } from './support/fixtures'

describe('M1 categories and templates', () => {
  let server: TestServer
  let fx: Fixtures

  beforeAll(async () => {
    server = await startPocketBase()
    fx = await Fixtures.create(server)
  })
  afterAll(() => server?.dispose())

  const copy = (
    pb: { send: <T>(path: string, options: object) => Promise<T> },
    id: string,
    body: object,
  ) => pb.send<RecordModel>(`/api/categories/${id}/copy`, { method: 'POST', body })

  it('M1-08: managers create categories in their event; coaches can read but not create', async () => {
    const event = await fx.event()
    const manager = await fx.user({ roles: [{ role: 'event_manager', event: event.id }] })
    const coach = await fx.user()

    const category = await manager.pb.collection('categories').create({
      event: event.id,
      name: 'RoboMission Elementary',
      code: 'RM-E',
      min_team_size: 2,
      max_team_size: 3,
    })
    expect((await coach.pb.collection('categories').getOne(category.id)).code).toBe('RM-E')
    await expectDenied(
      coach.pb.collection('categories').create({ event: event.id, name: 'X', code: 'X' }),
    )
  })

  it('rejects duplicate codes within an event and invalid ranges', async () => {
    const event = await fx.event()
    await fx.category(event.id, { code: 'DUP' })
    await expectDenied(fx.category(event.id, { code: 'DUP' }))
    await expectFieldError(
      fx.category(event.id, { min_team_size: 3, max_team_size: 2 }),
      'max_team_size',
      'invalid_range',
    )
    await expectFieldError(fx.category(event.id, { min_age: 15, max_age: 11 }), 'max_age')
  })

  it('templates are visible to admins and event managers only', async () => {
    const event = await fx.event()
    const template = await fx.category('', { code: 'TPL-VIS' })
    const manager = await fx.user({ roles: [{ role: 'event_manager', event: event.id }] })
    const judge = await fx.user({ roles: [{ role: 'judge', event: event.id }] })
    const coach = await fx.user()

    expect((await manager.pb.collection('categories').getOne(template.id)).id).toBe(template.id)
    await expectDenied(judge.pb.collection('categories').getOne(template.id))
    await expectDenied(coach.pb.collection('categories').getOne(template.id))
    // Only admins may create templates.
    await expectDenied(manager.pb.collection('categories').create({ name: 'T', code: 'T-MGR' }))
  })

  it('M1-T07 / M1-09: copying a template creates an independent configuration', async () => {
    const admin = await fx.admin()
    const event = await fx.event()
    const template = await admin.pb.collection('categories').create({
      name: 'Future Innovators',
      code: 'FI-TPL',
      min_team_size: 2,
      max_team_size: 3,
      settings: { scoring: { criteria: [{ id: 'a', points: 10 }] } },
    })

    const copied = await copy(admin.pb, template.id, { event: event.id, code: 'FI' })
    expect(copied).toMatchObject({
      event: event.id,
      code: 'FI',
      name: 'Future Innovators',
      max_team_size: 3,
      source: template.id,
      settings: { scoring: { criteria: [{ id: 'a', points: 10 }] } },
    })
    expect(copied.id).not.toBe(template.id)

    // Changing the source does not affect the copy, and vice versa.
    await admin.pb.collection('categories').update(template.id, {
      max_team_size: 5,
      settings: { scoring: { criteria: [{ id: 'a', points: 99 }] } },
    })
    await admin.pb.collection('categories').update(copied.id, { name: 'FI 2026' })

    const copyNow = await admin.pb.collection('categories').getOne(copied.id)
    const templateNow = await admin.pb.collection('categories').getOne(template.id)
    expect(copyNow.max_team_size).toBe(3)
    expect(copyNow.settings).toEqual({ scoring: { criteria: [{ id: 'a', points: 10 }] } })
    expect(templateNow.name).toBe('Future Innovators')
  })

  it('event categories can be saved back to the template library by admins', async () => {
    const admin = await fx.admin()
    const event = await fx.event()
    const category = await fx.category(event.id, { code: 'RM-S' })
    const template = await copy(admin.pb, category.id, { code: 'RM-S-TPL' })
    expect(template.event).toBe('')
    expect(template.source).toBe(category.id)
  })

  it('managers can copy into their own event only', async () => {
    const own = await fx.event()
    const other = await fx.event()
    const template = await fx.category('', { code: 'TPL-MGR' })
    const manager = await fx.user({ roles: [{ role: 'event_manager', event: own.id }] })

    expect((await copy(manager.pb, template.id, { event: own.id })).event).toBe(own.id)
    await expectDenied(copy(manager.pb, template.id, { event: other.id }))
    await expectDenied(copy(manager.pb, template.id, {}))
  })

  it('coaches cannot copy categories and unknown sources are not found', async () => {
    const event = await fx.event()
    const category = await fx.category(event.id)
    const coach = await fx.user()
    await expectDenied(copy(coach.pb, category.id, { event: event.id }))
    const admin = await fx.admin()
    const error = await expectDenied(copy(admin.pb, 'doesnotexist123', { event: event.id }))
    expect(error.status).toBe(404)
  })
})
