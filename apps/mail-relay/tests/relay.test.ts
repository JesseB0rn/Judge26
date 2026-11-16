import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { createHash, generateKeyPairSync, verify, constants, X509Certificate } from 'node:crypto'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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
        credential: { kind: 'secret', secret: 's3cret-value' },
        scope: 'https://outlook.office365.com/.default',
      },
      warnings: [],
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

async function startRelay(
  upstreamPort: number,
  fetch: typeof globalThis.fetch,
  env: Record<string, string | undefined> = ENV,
) {
  const config: RelayConfig = loadConfig({
    ...env,
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

// --- M10-G: certificate credential ------------------------------------------------------------

describe('certificate credential (M10-37 – M10-40)', () => {
  let dir: string
  let certFile: string
  let keyFile: string
  let certificate: X509Certificate
  let CERT_ENV: Record<string, string | undefined>

  beforeAll(() => {
    // A self-signed RSA certificate, as the deployment guide creates it.
    dir = mkdtempSync(join(tmpdir(), 'judge26-relay-'))
    certFile = join(dir, 'relay.crt')
    keyFile = join(dir, 'relay.key')
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-sha256',
        '-days',
        '365',
        '-subj',
        '/CN=judge26-mail-relay',
        '-keyout',
        keyFile,
        '-out',
        certFile,
      ],
      { stdio: 'ignore' },
    )
    certificate = new X509Certificate(readFile(certFile))
    CERT_ENV = {
      ...ENV,
      SMTP_OAUTH_CLIENT_SECRET: undefined,
      SMTP_OAUTH_CERTIFICATE_FILE: certFile,
      SMTP_OAUTH_PRIVATE_KEY_FILE: keyFile,
    }
  })

  function readFile(path: string) {
    return execFileSync('cat', [path]).toString()
  }

  const decode = (part: string) => JSON.parse(Buffer.from(part, 'base64url').toString())

  /** The form fields of each token request. */
  function bodies(fetch: ReturnType<typeof vi.fn<typeof globalThis.fetch>>) {
    return fetch.mock.calls.map(([, init]) => new URLSearchParams(String(init!.body)))
  }

  it('M10-37: certificate files replace the secret', () => {
    const config = loadConfig(CERT_ENV)
    expect(config.oauth.credential.kind).toBe('certificate')
    expect(config.warnings).toEqual([])
  })

  it('M10-T51: the token request carries a signed assertion and no secret; the token is reused', async () => {
    const config = loadConfig(CERT_ENV)
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(tokenResponse('tok1'))
    const now = Date.parse('2026-11-16T10:00:00Z')
    const tokens = createTokenProvider(config.oauth, { fetch, now: () => now })
    expect(await tokens.get()).toBe('tok1')
    expect(await tokens.get()).toBe('tok1')
    expect(fetch).toHaveBeenCalledTimes(1)

    const form = bodies(fetch)[0]!
    expect(form.get('client_secret')).toBeNull()
    expect(form.get('client_id')).toBe('client-id')
    expect(form.get('grant_type')).toBe('client_credentials')
    expect(form.get('client_assertion_type')).toBe(
      'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
    )
    const [head, body, signature] = form.get('client_assertion')!.split('.')
    expect(decode(head!)).toEqual({
      alg: 'PS256',
      typ: 'JWT',
      'x5t#S256': createHash('sha256').update(certificate.raw).digest('base64url'),
    })
    const claims = decode(body!)
    expect(claims).toMatchObject({
      aud: config.oauth.tokenUrl,
      iss: 'client-id',
      sub: 'client-id',
      iat: now / 1000,
      nbf: now / 1000,
    })
    // M10-38: at most 10 minutes.
    expect(claims.exp - claims.iat).toBe(600)
    // Verifiable with the certificate.
    expect(
      verify(
        'sha256',
        Buffer.from(`${head}.${body}`),
        {
          key: certificate.publicKey,
          padding: constants.RSA_PKCS1_PSS_PADDING,
          saltLength: constants.RSA_PSS_SALTLEN_DIGEST,
        },
        Buffer.from(signature!, 'base64url'),
      ),
    ).toBe(true)
  })

  it('M10-T52: every token request gets a new assertion', async () => {
    const config = loadConfig(CERT_ENV)
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementation(async () => tokenResponse('tok', 60))
    let now = Date.parse('2026-11-16T10:00:00Z')
    const tokens = createTokenProvider(config.oauth, { fetch, now: () => now })
    await tokens.get()
    now += 61_000
    await tokens.get()
    const ids = bodies(fetch).map((f) => decode(f.get('client_assertion')!.split('.')[1]!).jti)
    expect(ids).toHaveLength(2)
    expect(ids[0]).not.toBe(ids[1])
  })

  it('M10-T53: bad certificate settings stop the relay at start, naming the setting', () => {
    const other = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const otherKey = join(dir, 'other.key')
    writeFileSync(otherKey, other.privateKey.export({ type: 'pkcs8', format: 'pem' }))
    const ecKey = join(dir, 'ec.key')
    writeFileSync(
      ecKey,
      generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({
        type: 'pkcs8',
        format: 'pem',
      }),
    )
    const notPem = join(dir, 'not.pem')
    writeFileSync(notPem, 'hello')

    const fails = (env: Record<string, string | undefined>, now?: number) => {
      try {
        loadConfig(env, now === undefined ? {} : { now: () => now })
      } catch (e) {
        expect(e).toBeInstanceOf(ConfigError)
        return (e as Error).message
      }
      throw new Error('expected a configuration error')
    }
    expect(fails({ ...CERT_ENV, SMTP_OAUTH_PRIVATE_KEY_FILE: join(dir, 'missing.key') })).toMatch(
      /^SMTP_OAUTH_PRIVATE_KEY_FILE: cannot read .*missing\.key.*ENOENT/,
    )
    expect(fails({ ...CERT_ENV, SMTP_OAUTH_PRIVATE_KEY_FILE: undefined })).toBe(
      'Missing settings: SMTP_OAUTH_PRIVATE_KEY_FILE.',
    )
    expect(fails({ ...CERT_ENV, SMTP_OAUTH_CERTIFICATE_FILE: notPem })).toMatch(
      /^SMTP_OAUTH_CERTIFICATE_FILE: .* is not a PEM X\.509 certificate/,
    )
    expect(fails({ ...CERT_ENV, SMTP_OAUTH_PRIVATE_KEY_FILE: otherKey })).toBe(
      'SMTP_OAUTH_PRIVATE_KEY_FILE does not belong to the certificate in SMTP_OAUTH_CERTIFICATE_FILE.',
    )
    expect(fails({ ...CERT_ENV, SMTP_OAUTH_PRIVATE_KEY_FILE: ecKey })).toBe(
      'SMTP_OAUTH_PRIVATE_KEY_FILE: the key must be an RSA key.',
    )
    expect(fails({ ...CERT_ENV, SMTP_OAUTH_CLIENT_SECRET: 's3cret-value' })).toMatch(/not both/)
    // Expired, and not yet valid.
    const validTo = Date.parse(certificate.validTo)
    expect(fails(CERT_ENV, validTo + 1000)).toMatch(
      /^SMTP_OAUTH_CERTIFICATE_FILE: the certificate expired/,
    )
    expect(fails(CERT_ENV, Date.parse(certificate.validFrom) - 1000)).toMatch(/not valid before/)
    // The key never appears in a message.
    const pem = readFile(keyFile)
    const body = pem.split('\n')[1]!
    for (const message of [
      fails({ ...CERT_ENV, SMTP_OAUTH_PRIVATE_KEY_FILE: otherKey }),
      fails({ ...CERT_ENV, SMTP_OAUTH_CERTIFICATE_FILE: keyFile }),
    ]) {
      expect(message).not.toContain(body)
    }
  })

  it('M10-39: a certificate expiring within 30 days is a warning, not an error', () => {
    const validTo = Date.parse(certificate.validTo)
    const config = loadConfig(CERT_ENV, { now: () => validTo - 10 * 86_400_000 })
    expect(config.warnings).toEqual([expect.stringMatching(/expires in 10 day\(s\)/)])
  })

  it('M10-T54: a rejected assertion is a temporary failure, so the outbox retries; secrets keep working', async () => {
    const ms = await fakeMicrosoft(new Set(['tok1']))
    const rejected = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: 'invalid_client',
          error_description:
            'AADSTS700027: The certificate with identifier used to sign the client assertion is not registered on application.\r\nTrace ID: 1',
        }),
        { status: 401 },
      ),
    )
    const relay = await startRelay(ms.port, rejected, CERT_ENV)
    const error = (await send(relay).catch((e: unknown) => e)) as Error & { responseCode: number }
    expect(error.responseCode).toBe(451)
    expect(error.message).toContain(
      'OAuth: Token request failed (HTTP 401): invalid_client: AADSTS700027',
    )
    expect(error.message).not.toContain('eyJ') // no assertion (JWT) in the error
    expect(ms.received).toHaveLength(0)

    // With a valid certificate the message goes out with XOAUTH2, as with a secret (M9-T08).
    const ok = vi.fn<typeof globalThis.fetch>().mockResolvedValue(tokenResponse('tok1'))
    const relay2 = await startRelay(ms.port, ok, CERT_ENV)
    await send(relay2)
    expect(ms.logins).toEqual(['judge26@contoso.org:tok1'])
  })
})
