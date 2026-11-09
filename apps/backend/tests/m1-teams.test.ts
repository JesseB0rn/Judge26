import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { RecordModel } from 'pocketbase'
import { startPocketBase, type TestServer } from './support/pocketbase'
import {
  expectDenied,
  expectFieldError,
  Fixtures,
  validMembers,
  type TestUser,
} from './support/fixtures'

describe('M1 team registration and approval', () => {
  let server: TestServer
  let fx: Fixtures
  let event: RecordModel
  let category: RecordModel
  let admin: TestUser

  beforeAll(async () => {
    server = await startPocketBase()
    fx = await Fixtures.create(server)
    event = await fx.event({ status: 'published' })
    category = await fx.category(event.id)
    admin = await fx.admin()
  })
  afterAll(() => server?.dispose())

  let n = 0
  const register = (coach: TestUser, data: Record<string, unknown> = {}) =>
    coach.pb.collection('teams').create({
      event: event.id,
      category: category.id,
      name: `Team ${++n}`,
      coach: coach.id,
      status: 'draft',
      members: validMembers(),
      ...data,
    })

  it('M1-10: coaches create draft registrations; contact details default from the account', async () => {
    const coach = await fx.user({ name: 'Grace Hopper' })
    const team = await register(coach)
    expect(team).toMatchObject({
      status: 'draft',
      coach: coach.id,
      coach_email: coach.email,
      coach_name: 'Grace Hopper',
    })
  })

  it('coaches can register multiple teams', async () => {
    const coach = await fx.user()
    await register(coach)
    await register(coach)
    expect(await coach.pb.collection('teams').getFullList()).toHaveLength(2)
  })

  it('M1-T08: submitting a registration sets status submitted', async () => {
    const coach = await fx.user()
    const team = await register(coach)
    const submitted = await coach.pb.collection('teams').update(team.id, { status: 'submitted' })
    expect(submitted.status).toBe('submitted')
    expect(submitted.submitted_at).toBeTruthy()
    // Submitted registrations are locked for the coach.
    await expectDenied(coach.pb.collection('teams').update(team.id, { name: 'Changed' }))
  })

  it('incomplete teams cannot be submitted; drafts may be incomplete', async () => {
    const coach = await fx.user()
    const team = await register(coach, { members: [validMembers()[0]] })
    await expectFieldError(
      coach.pb.collection('teams').update(team.id, { status: 'submitted' }),
      'members',
      'incomplete_team',
    )
    await expectFieldError(
      register(coach, {
        status: 'submitted',
        members: [
          { first_name: 'Too', last_name: 'Young', birth_year: 2020 },
          { first_name: 'Ok', last_name: 'Member', birth_year: 2013 },
        ],
      }),
      'members',
      'incomplete_team',
    )
  })

  it('validates member data', async () => {
    const coach = await fx.user()
    await expectFieldError(
      register(coach, { members: [{ first_name: '', last_name: 'X', birth_year: 2013.5 }] }),
      'members',
      'invalid_members',
    )
    await expectFieldError(
      register(coach, { members: { not: 'a list' } }),
      'members',
      'invalid_members',
    )
  })

  it('M1-T09: rejecting a registration requires a reason and sets status rejected', async () => {
    const coach = await fx.user()
    const team = await register(coach, { status: 'submitted' })

    await expectFieldError(
      admin.pb.collection('teams').update(team.id, { status: 'rejected' }),
      'review_note',
      'required',
    )
    const rejected = await admin.pb
      .collection('teams')
      .update(team.id, { status: 'rejected', review_note: 'Missing school confirmation' })
    expect(rejected).toMatchObject({ status: 'rejected', reviewed_by: admin.id })
    expect(rejected.reviewed_at).toBeTruthy()

    // The coach can correct and resubmit.
    const resubmitted = await coach.pb
      .collection('teams')
      .update(team.id, { organization: 'School X', status: 'submitted' })
    expect(resubmitted.status).toBe('submitted')
  })

  it('M1-11: admins and event managers approve and edit registrations', async () => {
    const coach = await fx.user()
    const manager = await fx.user({ roles: [{ role: 'event_manager', event: event.id }] })
    const team = await register(coach, { status: 'submitted' })

    const edited = await manager.pb
      .collection('teams')
      .update(team.id, { organization: 'Edited by staff' })
    expect(edited.organization).toBe('Edited by staff')
    const approved = await manager.pb.collection('teams').update(team.id, { status: 'approved' })
    expect(approved).toMatchObject({ status: 'approved', reviewed_by: manager.id })
  })

  it('enforces the status workflow', async () => {
    const coach = await fx.user()
    const team = await register(coach)
    await expectFieldError(
      admin.pb.collection('teams').update(team.id, { status: 'approved' }),
      'status',
      'invalid_transition',
    )
    // Staff may create teams directly, but not in a terminal review state.
    await expectFieldError(
      admin.pb.collection('teams').create({
        event: event.id,
        category: category.id,
        name: `Team ${++n}`,
        coach_email: 'x@test.local',
        status: 'rejected',
        review_note: 'n/a',
      }),
      'status',
      'invalid_status',
    )
  })

  it('coaches cannot approve their own registrations or set review fields', async () => {
    const coach = await fx.user()
    await expectDenied(register(coach, { status: 'approved' }))
    const team = await register(coach)
    await expectDenied(coach.pb.collection('teams').update(team.id, { status: 'approved' }))
    await expectDenied(
      coach.pb.collection('teams').update(team.id, { review_note: 'self-approved' }),
    )
    await expectDenied(coach.pb.collection('teams').update(team.id, { coach: admin.id }))
  })

  it('M1-T11: a coach cannot access another coach’s team', async () => {
    const coachA = await fx.user()
    const coachB = await fx.user()
    const team = await register(coachA)

    await expectDenied(coachB.pb.collection('teams').getOne(team.id))
    await expectDenied(coachB.pb.collection('teams').update(team.id, { name: 'Stolen' }))
    await expectDenied(coachB.pb.collection('teams').delete(team.id))
    expect(await coachB.pb.collection('teams').getFullList()).toHaveLength(0)
    // Registering a team on behalf of someone else is not possible either.
    await expectDenied(register(coachB, { coach: coachA.id }))
  })

  it('coaches delete only their own drafts', async () => {
    const coach = await fx.user()
    const draft = await register(coach)
    const submitted = await register(coach, { status: 'submitted' })
    await coach.pb.collection('teams').delete(draft.id)
    await expectDenied(coach.pb.collection('teams').delete(submitted.id))
  })

  it('team names are unique per category (case-insensitive)', async () => {
    const coach = await fx.user()
    await register(coach, { name: 'Robo Rangers' })
    await expectDenied(register(coach, { name: 'robo rangers' }))
  })

  it('rejects a category from another event', async () => {
    const otherEvent = await fx.event()
    const foreign = await fx.category(otherEvent.id)
    const coach = await fx.user()
    await expectFieldError(
      register(coach, { category: foreign.id }),
      'category',
      'invalid_category',
    )
  })

  it('respects the registration window and event status', async () => {
    const coach = await fx.user()
    const closed = await fx.event({ registration_closes_at: '2020-01-01 00:00:00.000Z' })
    const draft = await fx.event({ status: 'draft' })
    for (const ev of [closed, draft]) {
      const cat = await fx.category(ev.id)
      await expectDenied(register(coach, { event: ev.id, category: cat.id }))
    }
  })

  it('enforces the maximum number of approved teams per category', async () => {
    const cat = await fx.category(event.id, { max_teams: 1 })
    const coach = await fx.user()
    const a = await register(coach, { category: cat.id, status: 'submitted' })
    const b = await register(coach, { category: cat.id, status: 'submitted' })
    await admin.pb.collection('teams').update(a.id, { status: 'approved' })
    await expectFieldError(
      admin.pb.collection('teams').update(b.id, { status: 'approved' }),
      'status',
      'category_full',
    )
  })
})
