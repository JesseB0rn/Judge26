import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AddressInfo } from 'node:net'
import nodemailer from 'nodemailer'
import { SMTPServer } from 'smtp-server'
import { ConfigError, loadConfig, type RelayConfig } from '../src/config.ts'
import { createDeliver, createRelay, type Logger } from '../src/relay.ts'
import { createTokenProvider, RENEW_BEFORE_MS, TokenError } from '../src/token.ts'

const ENV = {
  SMTP_OAUTH_TENANT_ID: 'contoso.onmicrosoft.com',
  SMTP_OAUTH_CLIENT_ID: 'client-id',
  SMTP_OAUTH_CLIENT_SECRET: 's3cret-value',
  MAIL_SENDER_ADDRESS: 'judge26@contoso.org',
}

const silent: Logger = { info: () => {}, error: () => {} }

describe('configuration (M9-12)', () => {
  it('derives the Microsoft 365 endpoints from the tenant', () => {
    expect(loadConfig(ENV)).toEqual({
      listen: { host: '0.0.0.0', port: 2525 },
      upstream: {
        host: 'smtp.office365.com',
        port: 587,
        tls: 'starttls',
        user: 'judge26@contoso.org',
      },
      oauth: {
        tokenUrl: 'https://login.microsoftonline.com/contoso.onmicrosoft.com/oauth2/v2.0/token',
        clientId: 'client-id',
        clientSecret: 's3cret-value',
        scope: 'https://outlook.office365.com/.default',
      },
    })
    expect(loadConfig({ ...ENV, SMTP_OAUTH_USER: 'mailer@contoso.org' }).upstream.user).toBe(
      'mailer@contoso.org',
    )
  })

  it('names every missing or invalid setting', () => {
    expect(() => loadConfig({})).toThrow(
      'Missing settings: SMTP_OAUTH_TENANT_ID, SMTP_OAUTH_CLIENT_ID, SMTP_OAUTH_CLIENT_SECRET, SMTP_OAUTH_USER (or MAIL_SENDER_ADDRESS).',
    )
    expect(() => loadConfig({ ...ENV, SMTP_OAUTH_TLS: 'maybe' })).toThrow(ConfigError)
    expect(() => loadConfig({ ...ENV, RELAY_PORT: '99999' })).toThrow(ConfigError)
  })
})

function tokenResponse(token: string, expiresIn = 3600, status = 200) {
  return new Response(JSON.stringify({ access_token: token, expires_in: expiresIn }), { status })
}

describe('OAuth tokens (M9-13)', () => {
  const oauth = loadConfig(ENV).oauth

  it('requests a client credentials token once and reuses it until shortly before expiry', async () => {
    let now = 1_000_000
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(tokenResponse('tok1'))
      .mockResolvedValueOnce(tokenResponse('tok2'))
    const tokens = createTokenProvider(oauth, { fetch, now: () => now })

    const [a, b] = await Promise.all([tokens.get(), tokens.get()])
    expect([a, b]).toEqual(['tok1', 'tok1'])
    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = fetch.mock.calls[0]!
    expect(url).toBe(oauth.tokenUrl)
    expect(Object.fromEntries(init!.body as URLSearchParams)).toEqual({
      grant_type: 'client_credentials',
      client_id: 'client-id',
      client_secret: 's3cret-value',
      scope: 'https://outlook.office365.com/.default',
    })

    now += 3600_000 - RENEW_BEFORE_MS - 1
    expect(await tokens.get()).toBe('tok1')
    now += 2
    expect(await tokens.get()).toBe('tok2')
    tokens.invalidate()
    fetch.mockResolvedValueOnce(tokenResponse('tok3'))
    expect(await tokens.get()).toBe('tok3')
  })

  it('reports token errors without the secret', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: 'invalid_client',
          error_description: 'AADSTS7000215: Invalid client secret provided.\r\nTrace ID: 1',
        }),
        { status: 401 },
      ),
    )
    const error = await createTokenProvider(oauth, { fetch })
      .get()
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(TokenError)
    expect((error as Error).message).toBe(
      'Token request failed (HTTP 401): invalid_client: AADSTS7000215: Invalid client secret provided.',
    )
    expect((error as Error).message).not.toContain('s3cret')

    fetch.mockRejectedValue(new Error('getaddrinfo ENOTFOUND'))
    await expect(createTokenProvider(oauth, { fetch }).get()).rejects.toThrow(
      'Token endpoint not reachable: getaddrinfo ENOTFOUND',
    )
  })
})

// --- End to end: PocketBase → relay → fake Microsoft 365 ------------------------------------

interface Received {
  from: string
  to: string[]
  raw: string
}

const servers: SMTPServer[] = []
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise((r) => s.close(() => r(null)))))
})

async function listen(server: SMTPServer) {
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return (server.server.address() as AddressInfo).port
}

/** Accepts only XOAUTH2 with a token in `valid`, like Microsoft 365. */
async function fakeMicrosoft(valid: Set<string>, options: { rejectRcpt?: boolean } = {}) {
  const received: Received[] = []
  const logins: string[] = []
  const server = new SMTPServer({
    authMethods: ['XOAUTH2'],
    disabledCommands: ['STARTTLS'],
    allowInsecureAuth: true,
    logger: false,
    onAuth(auth, _session, callback) {
      logins.push(`${auth.username}:${auth.accessToken}`)
      if (auth.method === 'XOAUTH2' && valid.has(auth.accessToken ?? '')) {
        return callback(null, { user: auth.username })
      }
      return callback(null, { data: { status: '401', schemes: 'bearer' } })
    },
    onRcptTo(address, _session, callback) {
      if (options.rejectRcpt) {
        const error = new Error('5.1.10 Recipient not found') as Error & { responseCode: number }
        error.responseCode = 550
        return callback(error)
      }
      callback()
    },
    onData(stream, session, callback) {
      let raw = ''
      stream.on('data', (c: Buffer) => (raw += c.toString()))
      stream.on('end', () => {
        received.push({
          from: session.envelope.mailFrom ? session.envelope.mailFrom.address : '',
          to: session.envelope.rcptTo.map((r) => r.address),
          raw,
        })
        callback()
      })
    },
  })
  return { port: await listen(server), received, logins }
}

async function startRelay(upstreamPort: number, fetch: typeof globalThis.fetch) {
  const config: RelayConfig = loadConfig({
    ...ENV,
    SMTP_OAUTH_HOST: '127.0.0.1',
    SMTP_OAUTH_PORT: String(upstreamPort),
    SMTP_OAUTH_TLS: 'none',
  })
  const tokens = createTokenProvider(config.oauth, { fetch })
  return listen(createRelay(createDeliver(config.upstream, tokens), silent))
}

/** Sends like PocketBase does: plain SMTP, no authentication. */
function send(relayPort: number, subject = 'Your schedule') {
  return nodemailer
    .createTransport({ host: '127.0.0.1', port: relayPort, secure: false, ignoreTLS: true })
    .sendMail({
      from: 'Judge26 <judge26@contoso.org>',
      to: 'coach@example.org',
      subject,
      html: '<p>Hello</p>',
    })
}

describe('relay (M9-14)', () => {
  it('M9-T08: delivers with XOAUTH2 and reuses the token for further messages', async () => {
    const ms = await fakeMicrosoft(new Set(['tok1']))
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(tokenResponse('tok1'))
    const relay = await startRelay(ms.port, fetch)

    await send(relay, 'First')
    await send(relay, 'Second')
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(ms.logins).toEqual(['judge26@contoso.org:tok1', 'judge26@contoso.org:tok1'])
    expect(ms.received.map((m) => [m.from, m.to])).toEqual([
      ['judge26@contoso.org', ['coach@example.org']],
      ['judge26@contoso.org', ['coach@example.org']],
    ])
    expect(ms.received[0]!.raw).toContain('Subject: First')
  })

  it('renews the token once when Microsoft 365 refuses it', async () => {
    const ms = await fakeMicrosoft(new Set(['fresh']))
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(tokenResponse('revoked'))
      .mockResolvedValueOnce(tokenResponse('fresh'))
    const relay = await startRelay(ms.port, fetch)
    await send(relay)
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(ms.received).toHaveLength(1)
  })

  it('M9-T09: a token error is a temporary failure, so the outbox retries', async () => {
    const ms = await fakeMicrosoft(new Set(['tok1']))
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response('{"error":"temporarily_unavailable"}', { status: 503 }))
    const relay = await startRelay(ms.port, fetch)
    const error = (await send(relay).catch((e: unknown) => e)) as Error & { responseCode: number }
    expect(error.responseCode).toBe(451)
    expect(error.message).toContain(
      'OAuth: Token request failed (HTTP 503): temporarily_unavailable',
    )
    expect(ms.received).toHaveLength(0)
  })

  it('passes permanent rejections on as permanent', async () => {
    const ms = await fakeMicrosoft(new Set(['tok1']), { rejectRcpt: true })
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(tokenResponse('tok1'))
    const relay = await startRelay(ms.port, fetch)
    const error = (await send(relay).catch((e: unknown) => e)) as Error & { responseCode: number }
    expect(error.responseCode).toBe(550)
    expect(error.message).toContain('Recipient not found')
  })
})
