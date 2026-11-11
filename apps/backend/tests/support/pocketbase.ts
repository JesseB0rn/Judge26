import { spawn, execFileSync, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import PocketBase from 'pocketbase'
import { binaryPath, hooksDir, migrationsDir } from '../../scripts/paths.mjs'

export const TEST_APP_URL = 'http://app.test'
export const SUPERUSER = { email: 'superuser@test.local', password: 'test-password-123' }

export interface TestServer {
  url: string
  dataDir: string
  /** Stops the server process but keeps the data directory. */
  stop(): Promise<void>
  /** Stops the server and deletes the data directory. */
  dispose(): Promise<void>
  /** Returns a client authenticated as the test superuser. */
  superuserClient(): Promise<PocketBase>
  /** Returns an unauthenticated client. */
  client(): PocketBase
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(() =>
        typeof address === 'object' && address
          ? resolve(address.port)
          : reject(new Error('no port')),
      )
    })
  })
}

async function waitForHealthy(url: string, proc: ChildProcess, output: () => string) {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    if (proc.exitCode !== null) {
      throw new Error(`PocketBase exited with code ${proc.exitCode}:\n${output()}`)
    }
    try {
      const res = await fetch(`${url}/api/health`)
      if (res.ok) return
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(`PocketBase did not become healthy at ${url}:\n${output()}`)
}

/**
 * Starts an isolated PocketBase instance for integration tests. Pass an existing
 * `dataDir` to restart against previously persisted data.
 */
export async function startPocketBase(
  options: { dataDir?: string; env?: Record<string, string> } = {},
): Promise<TestServer> {
  const dataDir = options.dataDir ?? mkdtempSync(join(tmpdir(), 'judge26-pb-'))
  const common = [`--dir=${dataDir}`, `--migrationsDir=${migrationsDir}`, `--hooksDir=${hooksDir}`]
  const env = { ...process.env, PB_ENV: 'test', APP_URL: TEST_APP_URL, ...options.env }

  execFileSync(
    binaryPath,
    ['superuser', 'upsert', SUPERUSER.email, SUPERUSER.password, ...common],
    {
      env,
      stdio: 'pipe',
    },
  )

  const port = await freePort()
  const url = `http://127.0.0.1:${port}`
  // --hooksWatch=false: otherwise editing a hook restarts the server mid-test.
  const proc = spawn(
    binaryPath,
    ['serve', `--http=127.0.0.1:${port}`, '--hooksWatch=false', ...common],
    { env },
  )
  let output = ''
  proc.stdout?.on('data', (d) => (output += d))
  proc.stderr?.on('data', (d) => (output += d))

  await waitForHealthy(url, proc, () => output)

  let stopping = false
  proc.once('exit', (code, signal) => {
    if (!stopping) {
      console.error(
        `PocketBase exited unexpectedly (code ${code}, signal ${signal}):\n${output.slice(-5000)}`,
      )
    }
  })

  const stop = () =>
    new Promise<void>((resolve) => {
      stopping = true
      if (proc.exitCode !== null) return resolve()
      proc.once('exit', () => resolve())
      proc.kill('SIGTERM')
    })

  const client = () => {
    const pb = new PocketBase(url)
    pb.autoCancellation(false)
    return pb
  }

  return {
    url,
    dataDir,
    stop,
    async dispose() {
      await stop()
      rmSync(dataDir, { recursive: true, force: true })
    },
    client,
    async superuserClient() {
      const pb = client()
      await pb.collection('_superusers').authWithPassword(SUPERUSER.email, SUPERUSER.password)
      return pb
    },
  }
}
