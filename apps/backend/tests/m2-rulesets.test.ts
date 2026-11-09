import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { RecordModel } from 'pocketbase'
import { EXAMPLE_RULESET, fingerprint } from '@judge26/scoring-engine'
import { startPocketBase, type TestServer } from './support/pocketbase'
import { expectDenied, expectFieldError, Fixtures, type TestUser } from './support/fixtures'

/** Minimal ruleset: one boolean criterion worth `points`. */
const simple = (points: number) => ({
  schemaVersion: 1,
  root: {
    id: 'total',
    label: 'Total',
    type: 'group',
    aggregate: 'sum',
    children: [{ id: 'task', label: 'Task', type: 'boolean', points }],
  },
})

interface Evaluation {
  version: number
  fingerprint: string
  total: number
  valid: boolean
  issues: { code: string; nodeId?: string }[]
  explanation: { formula: string }
}

describe('M2 rulesets (versioned scoring configuration)', () => {
  let server: TestServer
  let fx: Fixtures
  let admin: TestUser
  let event: RecordModel
  let category: RecordModel

  beforeAll(async () => {
    server = await startPocketBase()
    fx = await Fixtures.create(server)
    admin = await fx.admin()
    event = await fx.event()
    category = await fx.category(event.id)
  })
  afterAll(() => server?.dispose())

  const create = (user: TestUser, data: Record<string, unknown>) =>
    user.pb.collection('rulesets').create({ category: category.id, status: 'draft', ...data })
  const evaluate = (user: TestUser, id: string, values: object, mode?: string) =>
    user.pb.send<Evaluation>(`/api/rulesets/${id}/evaluate`, {
      method: 'POST',
      body: { values, mode },
    })

  it('assigns increasing version numbers per category', async () => {
    const cat = await fx.category(event.id)
    const v1 = await admin.pb
      .collection('rulesets')
      .create({ category: cat.id, status: 'draft', definition: simple(1) })
    const v2 = await admin.pb
      .collection('rulesets')
      .create({ category: cat.id, status: 'draft', definition: simple(2) })
    expect([v1.version, v2.version]).toEqual([1, 2])
    await expectDenied(
      admin.pb.collection('rulesets').create({ category: cat.id, status: 'draft', version: 7 }),
    )
  })

  it('drafts may be incomplete; publishing requires a valid ruleset (M2-12)', async () => {
    const draft = await create(admin, { definition: { schemaVersion: 1, root: {} } })
    expect(draft.status).toBe('draft')
    await expectFieldError(
      admin.pb.collection('rulesets').update(draft.id, { status: 'published' }),
      'definition',
      'invalid_ruleset',
    )
  })

  it('M2-T08: publishing a ruleset referencing a nonexistent criterion is rejected', async () => {
    const definition = simple(10)
    ;(definition.root.children[0] as Record<string, unknown>).condition = {
      ref: 'ghost',
      op: 'set',
    }
    const error = await expectFieldError(
      create(admin, { definition, status: 'published' }),
      'definition',
    )
    expect(JSON.stringify(error.response)).toContain('Unknown node')
  })

  it('M2-T09: publishing a ruleset with a circular reference is rejected', async () => {
    const definition = {
      schemaVersion: 1,
      root: {
        id: 'total',
        label: 'Total',
        type: 'group',
        aggregate: 'sum',
        children: [
          {
            id: 'a',
            label: 'A',
            type: 'boolean',
            points: 1,
            condition: { ref: 'b', op: 'eq', value: true },
          },
          {
            id: 'b',
            label: 'B',
            type: 'boolean',
            points: 1,
            condition: { ref: 'a', op: 'eq', value: true },
          },
        ],
      },
    }
    const error = await expectFieldError(
      create(admin, { definition, status: 'published' }),
      'definition',
    )
    expect(JSON.stringify(error.response)).toContain('Circular dependency')
  })

  it('publishing stamps fingerprint, time and publisher', async () => {
    const draft = await create(admin, { definition: EXAMPLE_RULESET })
    const published = await admin.pb
      .collection('rulesets')
      .update(draft.id, { status: 'published' })
    expect(published).toMatchObject({
      status: 'published',
      published_by: admin.id,
      fingerprint: fingerprint(EXAMPLE_RULESET),
    })
    expect(published.published_at).toBeTruthy()
  })

  it('M2-T10 / M2-14: published versions are immutable; changes create a new version', async () => {
    const v1 = await create(admin, { definition: simple(10), status: 'published' })

    for (const change of [{ definition: simple(99) }, { notes: 'edited' }, { status: 'draft' }]) {
      await expectDenied(admin.pb.collection('rulesets').update(v1.id, change))
    }
    await expectDenied(admin.pb.collection('rulesets').delete(v1.id))
    // Not even a superuser can change a published version.
    await expectDenied(fx.su.collection('rulesets').update(v1.id, { definition: simple(99) }))

    const v2 = await create(admin, { definition: simple(10), source: v1.id })
    await admin.pb
      .collection('rulesets')
      .update(v2.id, { definition: simple(20), status: 'published' })

    const unchanged = await admin.pb.collection('rulesets').getOne(v1.id)
    expect(unchanged.definition).toEqual(simple(10))
    expect(unchanged.fingerprint).toBe(v1.fingerprint)
  })

  it('M2-T11: evaluation uses exactly the requested (historical) version', async () => {
    const cat = await fx.category(event.id)
    const v1 = await admin.pb
      .collection('rulesets')
      .create({ category: cat.id, status: 'published', definition: simple(10) })
    const v2 = await admin.pb
      .collection('rulesets')
      .create({ category: cat.id, status: 'published', definition: simple(20) })

    const old = await evaluate(admin, v1.id, { task: true })
    const current = await evaluate(admin, v2.id, { task: true })
    expect(old).toMatchObject({ version: 1, total: 10, valid: true, fingerprint: v1.fingerprint })
    expect(current).toMatchObject({ version: 2, total: 20, fingerprint: v2.fingerprint })
    expect(old.explanation.formula).toBe('SUM(10) = 10')
  })

  it('the backend evaluates with the same engine as the frontend (example ruleset)', async () => {
    const published = await create(admin, { definition: EXAMPLE_RULESET, status: 'published' })
    const values = {
      flag: true,
      blocks: 4,
      parkFull: true,
      tower: 'three',
      bonus: true,
      runA: 7,
      runB: 12,
      touches: 1,
    }
    expect((await evaluate(admin, published.id, values)).total).toBe(87)

    const invalid = await evaluate(admin, published.id, {
      blocks: 2.5,
      parkFull: true,
      parkPartial: true,
    })
    expect(invalid.valid).toBe(false)
    expect(invalid.issues.map((i) => i.code)).toEqual(
      expect.arrayContaining(['required', 'not_integer', 'too_many_selected']),
    )
    expect((await evaluate(admin, published.id, {}, 'draft')).issues.map((i) => i.code)).toEqual([])
  })

  it('event managers manage rulesets of their own event only', async () => {
    const otherEvent = await fx.event()
    const otherCategory = await fx.category(otherEvent.id)
    const manager = await fx.user({ roles: [{ role: 'event_manager', event: event.id }] })

    const own = await create(manager, { definition: simple(5) })
    await manager.pb.collection('rulesets').update(own.id, { status: 'published' })
    await expectDenied(
      manager.pb
        .collection('rulesets')
        .create({ category: otherCategory.id, status: 'draft', definition: simple(1) }),
    )
    // Templates are admin-only.
    const template = await fx.category('', { code: 'TPL-RS' })
    await expectDenied(
      manager.pb
        .collection('rulesets')
        .create({ category: template.id, status: 'draft', definition: simple(1) }),
    )
  })

  it('rulesets follow category visibility; coaches can read but not change them', async () => {
    const published = await create(admin, { definition: simple(3), status: 'published' })
    const coach = await fx.user()
    expect((await coach.pb.collection('rulesets').getOne(published.id)).version).toBeGreaterThan(0)
    await expectDenied(create(coach, { definition: simple(1) }))

    const draftEvent = await fx.event({ status: 'draft' })
    const hiddenCategory = await fx.category(draftEvent.id)
    const hidden = await fx.su
      .collection('rulesets')
      .create({ category: hiddenCategory.id, status: 'published', definition: simple(1) })
    await expectDenied(coach.pb.collection('rulesets').getOne(hidden.id))
    await expectDenied(evaluate(coach, hidden.id, { task: true }))
  })

  it('managers cannot change rulesets of archived events', async () => {
    const archivedEvent = await fx.event()
    const cat = await fx.category(archivedEvent.id)
    const manager = await fx.user({ roles: [{ role: 'event_manager', event: archivedEvent.id }] })
    const draft = await fx.su
      .collection('rulesets')
      .create({ category: cat.id, status: 'draft', definition: simple(1) })
    await fx.su.collection('events').update(archivedEvent.id, { status: 'archived' })

    await expectDenied(
      manager.pb.collection('rulesets').update(draft.id, { definition: simple(2) }),
    )
    await expectDenied(
      manager.pb
        .collection('rulesets')
        .create({ category: cat.id, status: 'draft', definition: simple(3) }),
    )
  })

  it('copying a category copies its active ruleset as an independent version 1 (M1-09)', async () => {
    const template = await fx.category('', { code: 'TPL-COPY' })
    await fx.su
      .collection('rulesets')
      .create({ category: template.id, status: 'published', definition: simple(1) })
    const active = await fx.su
      .collection('rulesets')
      .create({ category: template.id, status: 'published', definition: simple(2) })
    await fx.su
      .collection('rulesets')
      .create({ category: template.id, status: 'draft', definition: simple(3) })

    const copy = await admin.pb.send<RecordModel>(`/api/categories/${template.id}/copy`, {
      method: 'POST',
      body: { event: event.id, code: 'COPIED' },
    })
    const copied = await admin.pb
      .collection('rulesets')
      .getFullList({ filter: `category = "${copy.id}"` })
    expect(copied).toHaveLength(1)
    expect(copied[0]).toMatchObject({
      version: 1,
      status: 'published',
      definition: simple(2),
      source: active.id,
      fingerprint: active.fingerprint,
    })
  })
})
