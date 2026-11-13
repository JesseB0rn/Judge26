import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startPocketBase, type TestServer } from './support/pocketbase'

// M9-D: with SMTP_AUTH=oauth2 PocketBase sends its email to the OAuth mail relay
// (apps/mail-relay, tested there end to end with a fake Microsoft 365).

interface Settings {
  smtp: { enabled: boolean; host: string; port: number; username: string; tls: boolean }
}

describe('M9-D email with OAuth', () => {
  let server: TestServer

  beforeAll(async () => {
    server = await startPocketBase({
      env: {
        SMTP_AUTH: 'oauth2',
        // Password settings are ignored in OAuth mode.
        SMTP_HOST: 'smtp.example.org',
        SMTP_USERNAME: 'someone',
        SMTP_PASSWORD: 'password',
        MAIL_RELAY_PORT: '2626',
      },
    })
  })
  afterAll(() => server?.dispose())

  it('M9-12: PocketBase delivers through the relay, without a password', async () => {
    const su = await server.superuserClient()
    const settings = await su.send<Settings>('/api/settings', {})
    expect(settings.smtp).toMatchObject({
      enabled: true,
      host: 'mail-relay',
      port: 2626,
      username: '',
      tls: false,
    })
  })
})
