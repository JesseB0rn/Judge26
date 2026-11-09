import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ClientResponseError } from 'pocketbase'
import { startPocketBase, type TestServer } from './support/pocketbase'

describe('M0 backend foundation', () => {
  let server: TestServer

  beforeAll(async () => {
    server = await startPocketBase()
  })

  afterAll(async () => {
    await server?.dispose()
  })

  it('M0-T02: starts and reports healthy', async () => {
    const health = await server.client().health.check()
    expect(health.code).toBe(200)
  })

  it('loads JS hooks and runs in the test environment', async () => {
    const res = await fetch(`${server.url}/api/app/info`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ name: 'judge26', environment: 'test' })
  })

  it('API responses are never cached', async () => {
    const res = await fetch(`${server.url}/api/collections/app_settings/records`)
    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  it('M0-T04: applies migrations to an empty database (collections and indexes)', async () => {
    const pb = await server.superuserClient()
    const collection = await pb.collections.getOne('app_settings')

    expect(collection.fields.map((f) => f.name)).toEqual(
      expect.arrayContaining(['id', 'key', 'value', 'description', 'created', 'updated']),
    )
    expect(collection.indexes).toEqual(
      expect.arrayContaining([expect.stringContaining('idx_app_settings_key')]),
    )
  })

  it('enforces the unique index on app_settings.key', async () => {
    const pb = await server.superuserClient()
    await pb.collection('app_settings').create({ key: 'unique.check', value: 1 })
    await expect(
      pb.collection('app_settings').create({ key: 'unique.check', value: 2 }),
    ).rejects.toBeInstanceOf(ClientResponseError)
  })

  it('M0-06: denies anonymous access with a structured error', async () => {
    const error = await server
      .client()
      .collection('app_settings')
      .getList()
      .catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ClientResponseError)
    const { status, response } = error as ClientResponseError
    expect(status).toBe(403)
    expect(response).toMatchObject({ status: 403, message: expect.any(String), data: {} })
  })
})

describe('M0-T05 / M0-07: persistence across restarts', () => {
  it('keeps stored data and re-applies migrations to an existing database', async () => {
    const first = await startPocketBase()
    try {
      const pb = await first.superuserClient()
      const created = await pb
        .collection('app_settings')
        .create({ key: 'persistence.check', value: { ok: true } })
      await first.stop()

      const second = await startPocketBase({ dataDir: first.dataDir })
      try {
        const pb2 = await second.superuserClient()
        const record = await pb2.collection('app_settings').getOne(created.id)
        expect(record.value).toEqual({ ok: true })
      } finally {
        await second.stop()
      }
    } finally {
      await first.dispose()
    }
  })
})
