#!/usr/bin/env node
// Seeds a running development backend with demo accounts and an event.
// Idempotent: existing records (matched by email / name / code) are reused.
//
//   pnpm dev            # in another terminal
//   pnpm seed
//
// PB_URL (default http://127.0.0.1:8090) selects the server.
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import PocketBase from 'pocketbase'
import { backendDir, binaryPath } from './paths.mjs'

const url = process.env.PB_URL ?? 'http://127.0.0.1:8090'
const SUPERUSER = { email: 'superuser@judge26.local', password: 'superuser-password' }
const PASSWORD = 'password123'

execFileSync(
  binaryPath,
  [
    'superuser',
    'upsert',
    SUPERUSER.email,
    SUPERUSER.password,
    `--dir=${process.env.PB_DATA_DIR ?? join(backendDir, 'pb_data')}`,
  ],
  { stdio: 'ignore' },
)

const pb = new PocketBase(url)
pb.autoCancellation(false)
await pb.collection('_superusers').authWithPassword(SUPERUSER.email, SUPERUSER.password)

async function upsert(collection, filter, data) {
  try {
    return await pb.collection(collection).getFirstListItem(filter)
  } catch {
    return pb.collection(collection).create(data)
  }
}

const user = (email, name) =>
  upsert('users', pb.filter('email = {:email}', { email }), {
    email,
    name,
    password: PASSWORD,
    passwordConfirm: PASSWORD,
    verified: true,
  })

const admin = await user('admin@judge26.local', 'Ada Admin')
const manager = await user('manager@judge26.local', 'Max Manager')
const headJudge = await user('headjudge@judge26.local', 'Hana Head-Judge')
const judge = await user('judge@judge26.local', 'Jo Judge')
const coach = await user('coach@judge26.local', 'Cora Coach')

const templates = []
for (const [code, name, minAge, maxAge] of [
  ['RM-E', 'RoboMission Elementary', 8, 12],
  ['RM-J', 'RoboMission Junior', 11, 15],
  ['RM-S', 'RoboMission Senior', 14, 19],
  ['FI-J', 'Future Innovators Junior', 11, 15],
]) {
  templates.push(
    await upsert('categories', pb.filter('event = "" && code = {:code}', { code }), {
      code,
      name,
      min_age: minAge,
      max_age: maxAge,
      min_team_size: 2,
      max_team_size: 3,
    }),
  )
}

const event = await upsert('events', pb.filter('name = {:name}', { name: 'WRO Demo Final 2026' }), {
  name: 'WRO Demo Final 2026',
  season: 2026,
  venue: 'Bern Expo',
  description: 'Demo event created by the seed script.',
  status: 'published',
})
for (const [date, label] of [
  ['2026-06-13', 'Day 1'],
  ['2026-06-14', 'Day 2'],
]) {
  await upsert(
    'competition_days',
    pb.filter('event = {:e} && date = {:d}', { e: event.id, d: date }),
    {
      event: event.id,
      date,
      label,
    },
  )
}

const categories = {}
for (const template of templates) {
  categories[template.code] = await pb
    .collection('categories')
    .getFirstListItem(pb.filter('event = {:e} && code = {:c}', { e: event.id, c: template.code }))
    .catch(() =>
      pb.send(`/api/categories/${template.id}/copy`, { method: 'POST', body: { event: event.id } }),
    )
}

for (const [u, role, ev] of [
  [admin, 'admin', ''],
  [manager, 'event_manager', event.id],
  [headJudge, 'head_judge', event.id],
  [judge, 'judge', event.id],
]) {
  await upsert(
    'role_assignments',
    pb.filter('user = {:u} && role = {:r} && event = {:e}', { u: u.id, r: role, e: ev }),
    {
      user: u.id,
      role,
      event: ev,
    },
  )
}

await upsert('teams', pb.filter('name = "Robo Rangers"'), {
  event: event.id,
  category: categories['RM-J'].id,
  name: 'Robo Rangers',
  organization: 'Demo School',
  country: 'CH',
  coach: coach.id,
  coach_name: coach.name,
  coach_email: coach.email,
  status: 'submitted',
  members: [
    { first_name: 'Ada', last_name: 'Lovelace', birth_year: 2013 },
    { first_name: 'Alan', last_name: 'Turing', birth_year: 2012 },
  ],
})

console.log(`Seeded ${url}. All demo accounts use the password "${PASSWORD}":`)
for (const u of [admin, manager, headJudge, judge, coach])
  console.log(`  ${u.email.padEnd(26)} ${u.name}`)
console.log(`Superuser dashboard: ${url}/_/  (${SUPERUSER.email} / ${SUPERUSER.password})`)
