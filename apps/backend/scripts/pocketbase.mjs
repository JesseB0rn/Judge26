#!/usr/bin/env node
// Runs the local PocketBase binary with the project's migrations/hooks directories
// and an environment-specific data directory.
//
//   PB_ENV=development (default) -> ./pb_data,      serve on 127.0.0.1:8090 with --dev
//   PB_ENV=test                  -> ./pb_data_test, serve on 127.0.0.1:8091
//
// Overrides: PB_DATA_DIR, PB_HTTP. Extra CLI args are passed through unchanged.
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { backendDir, binaryPath, hooksDir, migrationsDir } from './paths.mjs'

const environments = {
  development: {
    dataDir: 'pb_data',
    http: '127.0.0.1:8090',
    dev: true,
    appUrl: 'http://127.0.0.1:5173',
  },
  test: {
    dataDir: 'pb_data_test',
    http: '127.0.0.1:8091',
    dev: false,
    appUrl: 'http://127.0.0.1:4173',
  },
}

const envName = process.env.PB_ENV ?? 'development'
const env = environments[envName]
if (!env) {
  console.error(
    `Unknown PB_ENV "${envName}". Expected one of: ${Object.keys(environments).join(', ')}`,
  )
  process.exit(1)
}

if (!existsSync(binaryPath)) {
  console.error('PocketBase binary not found. Run `pnpm setup:backend` first.')
  process.exit(1)
}

const [command = 'serve', ...rest] = process.argv.slice(2)
const args = [
  command,
  `--dir=${process.env.PB_DATA_DIR ?? join(backendDir, env.dataDir)}`,
  `--migrationsDir=${migrationsDir}`,
  `--hooksDir=${hooksDir}`,
]
if (command === 'serve') {
  args.push(`--http=${process.env.PB_HTTP ?? env.http}`)
  if (env.dev) args.push('--dev')
  // Restart on hook changes only in development (hot reload); never mid-test.
  else args.push('--hooksWatch=false')
}
args.push(...rest)

const child = spawn(binaryPath, args, {
  stdio: 'inherit',
  env: { APP_URL: env.appUrl, ...process.env, PB_ENV: envName },
})
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)))
