import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startPocketBase, type TestServer } from './support/pocketbase'
import { Fixtures, mailsTo, type TestUser } from './support/fixtures'

// M7-13 monitoring (docs/specifications/M7-monitoring.md, docs/test-plans/M7-monitoring.md).

interface Check {
  id: string
  label: string
  status: 'ok' | 'warn' | 'down'
  detail: string
}

interface Monitoring {
  status: 'ok' | 'degraded' | 'down'
  version: string
  started_at: string
  checks: Check[]
  alerts: boolean
  recent_errors: { source: string; message: string; detail: string; url: string }[]
}

const ALERT_TO = 'ops@test.local'

/**
 * PocketBase writes logs in batches, 3 s after the last entry (each request is an entry), so
 * log-based results appear only when the server has been quiet that long: poll slowly.
 */
async function eventually<T>(
  read: () => Promise<T>,
  ok: (value: T) => boolean,
  interval = 3500,
  ms = 15_000,
) {
  const deadline = Date.now() + ms
  let value = await read()
  while (!ok(value) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, interval))
    value = await read()
  }
  return value
}

describe('M7 monitoring', () => {
  let server: TestServer
  let fx: Fixtures
  let admin: TestUser

  beforeAll(async () => {
    server = await startPocketBase({
      env: { BACKUP_CRON: '0 3 * * *', MONITORING_ALERT_EMAIL: ALERT_TO },
    })
    fx = await Fixtures.create(server)
    admin = await fx.admin()
  })
  afterAll(() => server?.dispose())

  const monitoring = () => admin.pb.send<Monitoring>('/api/app/monitoring', {})
  const check = (m: Monitoring, id: string) => m.checks.find((c) => c.id === id)!
  const post = (path: string, body: unknown = {}) =>
    fetch(`${server.url}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  const runAlerts = async () =>
    (await (await post('/api/dev/monitoring/run')).json()) as {
      status: string
      failing: string[]
      alerted: string[]
    }

  it('M7-13: a fresh server is healthy; the public status has no details', async () => {
    const res = await fetch(`${server.url}/api/app/health`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('ok')
    expect(Object.keys(body).sort()).toEqual(['checked_at', 'status'])

    const m = await monitoring()
    expect(m.status).toBe('ok')
    expect(m.checks.map((c) => c.id)).toEqual(['database', 'errors', 'mail', 'backups'])
    expect(m.checks.every((c) => c.status === 'ok')).toBe(true)
    expect(check(m, 'backups').detail).toContain('No backup yet')
    expect(m.alerts).toBe(true)
    expect(Date.parse(m.started_at)).toBeLessThanOrEqual(Date.now())
  })

  it('M7-13: only admins see the details', async () => {
    const guest = server.client()
    await expect(guest.send('/api/app/monitoring', {})).rejects.toMatchObject({ status: 401 })
    const user = await fx.user()
    await expect(user.pb.send('/api/app/monitoring', {})).rejects.toMatchObject({ status: 403 })
    const manager = await fx.user({
      roles: [{ role: 'event_manager', event: (await fx.event()).id }],
    })
    await expect(manager.pb.send('/api/app/monitoring', {})).rejects.toMatchObject({ status: 403 })
    const su = await server.superuserClient()
    expect((await su.send<Monitoring>('/api/app/monitoring', {})).checks).toHaveLength(4)
  })

  it('M7-13: the backup check reports the latest backup', async () => {
    await fx.su.backups.create('monitoring-test.zip')
    const m = await monitoring()
    expect(check(m, 'backups')).toMatchObject({ status: 'ok' })
    expect(check(m, 'backups').detail).toContain('Latest backup less than an hour ago')
  })

  // Runs before the error tests: the error check stays failing for its whole window.
  it('M7-13: failed emails degrade the status and alert the operators once, then recover', async () => {
    const failed = await fx.su.collection('mail_outbox').create({
      to: 'coach@test.local',
      subject: 'Registration received',
      status: 'failed',
      attempts: 5,
      last_error: 'SMTP 550',
    })
    const m = await monitoring()
    expect(m.status).toBe('degraded')
    expect(check(m, 'mail')).toMatchObject({ status: 'warn' })
    expect(check(m, 'mail').detail).toContain('1 email failed in the last 24 hours')

    expect(await runAlerts()).toMatchObject({ failing: ['mail'], alerted: [ALERT_TO] })
    const alerts = await eventually(
      () => mailsTo(server, ALERT_TO),
      (mails) => mails.length === 1,
      100,
    )
    expect(alerts).toHaveLength(1)
    expect(alerts[0]!.subject).toBe('Judge26 degraded: Email delivery needs attention')
    expect(alerts[0]!.html).toContain('1 email failed in the last 24 hours')
    expect(alerts[0]!.html).toContain('http://app.test/admin/monitoring')

    // Still failing: no second alert.
    expect((await runAlerts()).alerted).toEqual([])

    await fx.su.collection('mail_outbox').delete(failed.id)
    expect(await runAlerts()).toMatchObject({ status: 'ok', failing: [], alerted: [ALERT_TO] })
    const after = await eventually(
      () => mailsTo(server, ALERT_TO),
      (mails) => mails.length === 2,
      100,
    )
    expect(after[1]!.subject).toBe('Judge26: all checks are OK again')
  })

  it('M7-13: overdue emails mean the delivery job is not running', async () => {
    const stuck = await fx.su.collection('mail_outbox').create({
      to: 'coach@test.local',
      subject: 'Schedule changed',
      status: 'pending',
      attempts: 0,
      next_attempt_at: new Date(Date.now() - 30 * 60000).toISOString().replace('T', ' '),
    })
    expect(check(await monitoring(), 'mail').detail).toContain('1 email overdue')
    await fx.su.collection('mail_outbox').delete(stuck.id)
    expect(check(await monitoring(), 'mail').status).toBe('ok')
  })

  it('M7-13: client errors (4xx) are not counted as errors', async () => {
    await fetch(`${server.url}/api/nope`)
    await fetch(`${server.url}/api/app/monitoring`)
    await server
      .client()
      .collection('users')
      .authWithPassword('x@test.local', 'wrong')
      .catch(() => {})
    // Give the log writer time to flush before checking that nothing was counted.
    await new Promise((r) => setTimeout(r, 4000))
    expect(check(await monitoring(), 'errors')).toMatchObject({ status: 'ok' })
  })

  it('M7-13: server errors are counted and listed', async () => {
    await fetch(`${server.url}/api/dev/monitoring/crash`)
    await post('/api/dev/monitoring/error', { message: 'Ranking job failed' })
    const m = await eventually(monitoring, (v) => check(v, 'errors').status === 'warn')
    expect(m.status).toBe('degraded')
    expect(check(m, 'errors').detail).toBe('2 server errors in the last 60 minutes')
    expect(m.recent_errors.map((e) => e.message)).toEqual(
      expect.arrayContaining(['Ranking job failed', 'GET /api/dev/monitoring/crash']),
    )
    const crash = m.recent_errors.find((e) => e.url === '/api/dev/monitoring/crash')!
    expect(crash).toMatchObject({ source: 'server' })
    expect(crash.detail).toContain('Simulated crash')
  })

  it('M7-13: browser errors are logged, validated and rate-limited', async () => {
    const res = await post('/api/app/client-errors', {
      message: 'TypeError: rounds is undefined',
      stack: 'at RankingView.vue:42',
      url: '/events/e1/rankings',
    })
    expect(res.status).toBe(204)
    expect((await post('/api/app/client-errors', { message: ' ' })).status).toBe(400)
    // Long fields are cut.
    expect(
      (await post('/api/app/client-errors', { message: 'x'.repeat(5000), stack: 'y'.repeat(9000) }))
        .status,
    ).toBe(204)

    const m = await eventually(
      monitoring,
      (v) => v.recent_errors.filter((e) => e.source === 'browser').length >= 2,
    )
    expect(check(m, 'errors').detail).toContain('2 browser errors')
    expect(m.recent_errors.find((e) => e.message.startsWith('TypeError'))).toMatchObject({
      message: 'TypeError: rounds is undefined',
      detail: 'at RankingView.vue:42',
      url: '/events/e1/rankings',
    })
    const long = m.recent_errors.find((e) => e.message.startsWith('xxx'))!
    expect(long.message).toHaveLength(500)
    expect(long.detail).toHaveLength(2000)

    // 10 per client per minute; the three reports above count too.
    const statuses: number[] = []
    for (let i = 0; i < 10; i++) {
      statuses.push((await post('/api/app/client-errors', { message: `Spam ${i}` })).status)
    }
    expect(statuses.filter((s) => s === 204)).toHaveLength(7)
    expect(statuses.at(-1)).toBe(429)
  })
})

describe('M7 monitoring in production', () => {
  let server: TestServer

  beforeAll(async () => {
    server = await startPocketBase({ env: { PB_ENV: 'production', BACKUP_CRON: 'off' } })
  })
  afterAll(() => server?.dispose())

  it('M7-13: missing SMTP and disabled backups are reported', async () => {
    const su = await server.superuserClient()
    const m = await su.send<Monitoring>('/api/app/monitoring', {})
    expect(m.status).toBe('degraded')
    expect(m.alerts).toBe(false)
    expect(m.checks.find((c) => c.id === 'mail')!.detail).toContain('SMTP is not configured')
    expect(m.checks.find((c) => c.id === 'backups')!.detail).toContain(
      'Automatic backups are disabled',
    )
    const res = await fetch(`${server.url}/api/app/health`)
    expect(res.status).toBe(200)
    expect((await res.json()).status).toBe('degraded')
  })
})
