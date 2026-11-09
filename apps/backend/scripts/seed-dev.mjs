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
// Node strips TypeScript types natively; example.ts has no runtime dependencies.
import { EXAMPLE_RULESET } from '../../../packages/scoring-engine/src/example.ts'
import { EXAMPLE_RANKING_CONFIG } from '../../../packages/ranking-engine/src/example.ts'

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

// Published example ruleset for every template (copied into events with the category).
for (const template of templates) {
  await upsert('rulesets', pb.filter('category = {:c}', { c: template.id }), {
    category: template.id,
    status: 'published',
    definition: EXAMPLE_RULESET,
    notes: 'Example ruleset from the seed script.',
  })
}

// Rounds and ranking configuration (M3) on templates and, below, on event categories.
async function setupRanking(category) {
  for (const [i, key] of ['R1', 'R2', 'R3'].entries()) {
    await upsert('rounds', pb.filter('category = {:c} && key = {:k}', { c: category.id, k: key }), {
      category: category.id,
      key,
      name: `Round ${i + 1}`,
      position: i + 1,
    })
  }
  if (!category.ranking)
    await pb.collection('categories').update(category.id, { ranking: EXAMPLE_RANKING_CONFIG })
}
for (const template of templates) await setupRanking(template)

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

for (const category of Object.values(categories)) {
  await setupRanking(await pb.collection('categories').getOne(category.id))
}

// Approved demo teams with results in RM-J (M3).
const rmj = categories['RM-J']
const demoRounds = await pb
  .collection('rounds')
  .getFullList({ filter: pb.filter('category = {:c}', { c: rmj.id }) })
const roundId = Object.fromEntries(demoRounds.map((r) => [r.key, r.id]))
for (const [name, results] of [
  [
    'Bot Builders',
    [
      ['R1', 85, 101_500],
      ['R2', 110, 98_200],
    ],
  ],
  [
    'Circuit Breakers',
    [
      ['R1', 110, 104_000],
      ['R2', 95, 99_000],
    ],
  ],
  ['Gear Grinders', [['R1', 60, 120_000]]],
]) {
  const team = await upsert('teams', pb.filter('name = {:n}', { n: name }), {
    event: event.id,
    category: rmj.id,
    name,
    organization: 'Demo School',
    coach_email: 'coach@judge26.local',
    status: 'approved',
    members: [
      { first_name: 'Demo', last_name: 'One', birth_year: 2013 },
      { first_name: 'Demo', last_name: 'Two', birth_year: 2012 },
    ],
  })
  for (const [round, points, time] of results) {
    await upsert(
      'games',
      pb.filter('team = {:t} && round = {:r}', { t: team.id, r: roundId[round] }),
      {
        round: roundId[round],
        team: team.id,
        attempt: 1,
        status: 'completed',
        points,
        time_ms: time,
      },
    )
  }
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
