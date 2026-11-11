#!/usr/bin/env node
// Deployment smoke test (M7-14): checks a running Judge26 instance from the outside.
//
//   node scripts/smoke-test.mjs https://judge.example.org
//
// Optional environment: EXPECT_VERSION, EXPECT_COMMIT (the build that should run),
// PB_SUPERUSER_EMAIL / PB_SUPERUSER_PASSWORD (adds checks that need the superuser).
// Exits with 1 if any check fails. Uses only Node.js built-ins (Node 24).
const base = (process.argv[2] ?? process.env.BASE_URL ?? 'http://127.0.0.1:8090').replace(
  /\/+$/,
  '',
)
const results = []

async function check(name, fn) {
  try {
    const detail = await fn()
    results.push({ name, ok: true })
    console.log(`  ok    ${name}${detail ? ` (${detail})` : ''}`)
  } catch (e) {
    results.push({ name, ok: false })
    console.log(`  FAIL  ${name}: ${e.message}`)
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function get(path, init) {
  return fetch(`${base}${path}`, { redirect: 'manual', ...init })
}

console.log(`Smoke test of ${base}`)

await check('API is healthy', async () => {
  const res = await get('/api/health')
  assert(res.status === 200, `status ${res.status}`)
})

let info
await check('hooks are loaded and the production build runs', async () => {
  const res = await get('/api/app/info')
  assert(res.status === 200, `status ${res.status}`)
  info = await res.json()
  assert(info.name === 'judge26', `name ${info.name}`)
  assert(info.environment === 'production', `environment ${info.environment}`)
  if (process.env.EXPECT_VERSION) {
    assert(info.version === process.env.EXPECT_VERSION, `version ${info.version}`)
  }
  if (process.env.EXPECT_COMMIT) {
    assert(info.commit === process.env.EXPECT_COMMIT, `commit ${info.commit}`)
  }
  return `version ${info.version}, commit ${String(info.commit).slice(0, 12)}`
})

let indexHtml = ''
await check('the app is served, also for client-side routes', async () => {
  const res = await get('/')
  assert(res.status === 200, `status ${res.status}`)
  indexHtml = await res.text()
  assert(indexHtml.includes('<div id="app">'), 'no app root in index.html')
  const deep = await get('/events/does-not-exist?tab=teams')
  assert(deep.status === 200, `deep link status ${deep.status}`)
  assert((await deep.text()) === indexHtml, 'deep link does not serve index.html')
})

await check('built assets load', async () => {
  const assets = [...indexHtml.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1])
  assert(assets.length > 0, 'no assets referenced')
  for (const asset of assets) {
    const res = await get(asset)
    assert(res.status === 200, `${asset}: ${res.status}`)
  }
  return `${assets.length} files`
})

await check('public API works and is not cached', async () => {
  const res = await get('/api/public/events')
  assert(res.status === 200, `status ${res.status}`)
  assert(Array.isArray(await res.json()), 'not a list')
  assert(
    res.headers.get('cache-control') === 'no-store',
    `cache-control ${res.headers.get('cache-control')}`,
  )
})

await check('security headers are set', async () => {
  const res = await get('/')
  assert(res.headers.get('x-content-type-options') === 'nosniff', 'X-Content-Type-Options')
  assert(res.headers.get('x-frame-options') === 'SAMEORIGIN', 'X-Frame-Options')
})

await check('development endpoints are absent', async () => {
  for (const [method, path] of [
    ['GET', '/api/dev/mails'],
    ['POST', '/api/dev/mail-failures'],
    ['POST', '/api/dev/mail-outbox/process'],
  ]) {
    const res = await get(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: method === 'POST' ? '{}' : undefined,
    })
    assert(res.status === 404, `${method} ${path}: ${res.status}`)
  }
})

await check('restricted data needs an account', async () => {
  for (const collection of ['teams', 'games', 'audit_log', 'mail_outbox', 'score_sheets']) {
    const res = await get(`/api/collections/${collection}/records`)
    const body = await res.json()
    assert(res.status !== 200 || body.totalItems === 0, `${collection} readable by guests`)
  }
})

const email = process.env.PB_SUPERUSER_EMAIL
const password = process.env.PB_SUPERUSER_PASSWORD
if (email && password) {
  let token = ''
  await check('superuser can sign in', async () => {
    const res = await get('/api/collections/_superusers/auth-with-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identity: email, password }),
    })
    assert(res.status === 200, `status ${res.status}`)
    token = (await res.json()).token
  })
  const auth = () => ({ headers: { Authorization: token } })
  await check('all migrations are applied', async () => {
    const res = await get('/api/collections?perPage=200&fields=name', auth())
    const names = (await res.json()).items.map((c) => c.name)
    for (const name of [
      'events',
      'teams',
      'games',
      'score_sheets',
      'live_revisions',
      'mail_outbox',
      'audit_log',
    ]) {
      assert(names.includes(name), `collection ${name} missing`)
    }
    return `${names.length} collections`
  })
  await check('automatic backups are scheduled', async () => {
    const res = await get('/api/settings', auth())
    const settings = await res.json()
    assert(settings.backups?.cron, 'no backup schedule')
    return settings.backups.cron
  })
}

const failed = results.filter((r) => !r.ok).length
console.log(
  failed ? `${failed} of ${results.length} checks failed.` : `All ${results.length} checks passed.`,
)
process.exit(failed ? 1 : 0)
