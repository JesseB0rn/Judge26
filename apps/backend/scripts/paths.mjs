import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const backendDir = join(dirname(fileURLToPath(import.meta.url)), '..')
export const pocketbaseVersion = readFileSync(join(backendDir, 'pocketbase.version'), 'utf8').trim()
export const binaryPath = join(
  backendDir,
  'bin',
  process.platform === 'win32' ? 'pocketbase.exe' : 'pocketbase',
)
export const migrationsDir = join(backendDir, 'migrations')
export const hooksDir = join(backendDir, 'hooks')
