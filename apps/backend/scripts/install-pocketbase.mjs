#!/usr/bin/env node
// Downloads the pinned PocketBase release (see ../pocketbase.version) into ./bin
// and verifies it against the release checksums.
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { backendDir, binaryPath, pocketbaseVersion } from './paths.mjs'

const platforms = { darwin: 'darwin', linux: 'linux', win32: 'windows' }
const arches = { arm64: 'arm64', x64: 'amd64' }

const os = platforms[process.platform]
const arch = arches[process.arch]
if (!os || !arch) {
  console.error(`Unsupported platform: ${process.platform}/${process.arch}`)
  process.exit(1)
}

const force = process.argv.includes('--force')
if (!force && existsSync(binaryPath)) {
  const installed = execFileSync(binaryPath, ['--version']).toString().trim()
  if (installed.endsWith(pocketbaseVersion)) {
    console.log(`PocketBase ${pocketbaseVersion} already installed (${binaryPath})`)
    process.exit(0)
  }
}

const asset = `pocketbase_${pocketbaseVersion}_${os}_${arch}.zip`
const baseUrl = `https://github.com/pocketbase/pocketbase/releases/download/v${pocketbaseVersion}`

async function download(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`GET ${url} failed: ${res.status} ${res.statusText}`)
  return Buffer.from(await res.arrayBuffer())
}

console.log(`Downloading ${asset} ...`)
const [archive, checksums] = await Promise.all([
  download(`${baseUrl}/${asset}`),
  download(`${baseUrl}/checksums.txt`).then((b) => b.toString()),
])

const expected = checksums
  .split('\n')
  .map((line) => line.trim().split(/\s+/))
  .find(([, name]) => name === asset)?.[0]
const actual = createHash('sha256').update(archive).digest('hex')
if (!expected || expected !== actual) {
  console.error(`Checksum mismatch for ${asset}: expected ${expected}, got ${actual}`)
  process.exit(1)
}

const zipPath = join(tmpdir(), asset)
writeFileSync(zipPath, archive)
const binDir = join(backendDir, 'bin')
rmSync(binDir, { recursive: true, force: true })
mkdirSync(binDir, { recursive: true })
execFileSync('unzip', ['-q', '-o', zipPath, '-d', binDir], { stdio: 'inherit' })
rmSync(zipPath)

console.log(execFileSync(binaryPath, ['--version']).toString().trim())
console.log(`Installed to ${binaryPath}`)
