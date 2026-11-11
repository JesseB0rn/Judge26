import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig, devices } from '@playwright/test'
import { API_URL, SUPERUSER } from './support/backend'

const isCI = !!process.env.CI

// Every run gets a fresh, empty database so tests are independent of local data.
// Stored in the environment so worker processes (which re-load this file) reuse it.
process.env.JUDGE26_E2E_DATA_DIR ??= mkdtempSync(join(tmpdir(), 'judge26-e2e-'))
const dataDir = process.env.JUDGE26_E2E_DATA_DIR

// Ports match apps/web/.env.test and the PB_ENV=test defaults in apps/backend.
const WEB_URL = 'http://127.0.0.1:4173'

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  // All workers share one PocketBase (SQLite) whose list access rules are expensive; one worker
  // per core overloads it and turns waits into timeouts. Locally, half the cores.
  workers: isCI ? 1 : '50%',
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: WEB_URL,
    trace: 'on-first-retry',
    // The UI follows the browser language (docs/specifications/i18n.md); tests read English text.
    locale: 'en-US',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    // Judges use tablets (ROADMAP M5 usability criteria: 768 × 1024).
    {
      name: 'tablet',
      use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 }, hasTouch: true },
    },
  ],
  webServer: [
    {
      // Creates the superuser used for seeding (support/backend.ts), then serves.
      command: `pnpm --filter @judge26/backend exec node scripts/pocketbase.mjs superuser upsert ${SUPERUSER.email} ${SUPERUSER.password} && pnpm --filter @judge26/backend serve:test`,
      url: `${API_URL}/api/health`,
      env: { PB_DATA_DIR: dataDir, PB_ENV: 'test' },
      reuseExistingServer: !isCI,
    },
    {
      command:
        'pnpm --filter @judge26/web exec vite build --mode test && pnpm --filter @judge26/web preview',
      url: WEB_URL,
      reuseExistingServer: !isCI,
      timeout: 120_000,
    },
  ],
})
