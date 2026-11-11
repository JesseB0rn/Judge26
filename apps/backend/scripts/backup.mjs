#!/usr/bin/env node
// Backups from the command line (M7-09, M7-10), through PocketBase's backup API.
//
//   node scripts/backup.mjs create [--download <dir>]   create a backup (and download it)
//   node scripts/backup.mjs list                         list backups on the server
//   node scripts/backup.mjs download <name> [<dir>]      download a backup
//   node scripts/backup.mjs upload <file>                upload a backup ZIP to the server
//   node scripts/backup.mjs restore <name> --yes         restore a backup (replaces all data!)
//
// Environment: PB_URL (default http://127.0.0.1:8090), PB_SUPERUSER_EMAIL, PB_SUPERUSER_PASSWORD.
// See docs/operations/backup-and-restore.md.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import PocketBase from 'pocketbase'

const url = process.env.PB_URL ?? 'http://127.0.0.1:8090'
const email = process.env.PB_SUPERUSER_EMAIL
const password = process.env.PB_SUPERUSER_PASSWORD
const [command, ...args] = process.argv.slice(2)

function fail(message) {
  console.error(message)
  process.exit(1)
}

if (!command || !['create', 'list', 'download', 'upload', 'restore'].includes(command)) {
  fail(
    'Usage: backup.mjs create [--download <dir>] | list | download <name> [<dir>] | upload <file> | restore <name> --yes',
  )
}
if (!email || !password) fail('Set PB_SUPERUSER_EMAIL and PB_SUPERUSER_PASSWORD.')

const pb = new PocketBase(url)
await pb.collection('_superusers').authWithPassword(email, password)

async function download(name, dir = '.') {
  const token = await pb.files.getToken()
  const res = await fetch(`${url}/api/backups/${encodeURIComponent(name)}?token=${token}`)
  if (!res.ok) fail(`Download failed: ${res.status} ${await res.text()}`)
  mkdirSync(dir, { recursive: true })
  const path = join(dir, name)
  writeFileSync(path, Buffer.from(await res.arrayBuffer()))
  console.log(`Downloaded ${path}`)
}

switch (command) {
  case 'create': {
    const stamp = new Date()
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\..*/, '')
      .replace('T', '_')
    const name = `judge26_${stamp}.zip`
    await pb.backups.create(name)
    console.log(`Created ${name}`)
    const i = args.indexOf('--download')
    if (i !== -1) await download(name, args[i + 1] ?? '.')
    break
  }
  case 'list':
    for (const b of await pb.backups.getFullList()) {
      console.log(`${b.modified}  ${String(b.size).padStart(12)}  ${b.key}`)
    }
    break
  case 'download':
    if (!args[0]) fail('Name required.')
    await download(args[0], args[1])
    break
  case 'upload': {
    if (!args[0]) fail('File required.')
    const file = new File([readFileSync(args[0])], basename(args[0]), { type: 'application/zip' })
    await pb.backups.upload({ file })
    console.log(`Uploaded ${basename(args[0])}`)
    break
  }
  case 'restore':
    if (!args[0]) fail('Name required.')
    if (!args.includes('--yes')) fail('Restoring replaces ALL current data. Add --yes to confirm.')
    await pb.backups.restore(args[0])
    console.log(`Restoring ${args[0]}; the server restarts when done.`)
    break
}
