import nodemailer from 'nodemailer'
import { SMTPServer } from 'smtp-server'
import type { RelayConfig } from './config.ts'
import { TokenError, type TokenProvider } from './token.ts'

// The relay (M9-D): PocketBase hands every email to it over plain SMTP inside the compose
// network; the relay delivers it to Microsoft 365 with SMTP AUTH XOAUTH2. A message is accepted
// only once Microsoft 365 accepted it, so delivery errors reach PocketBase and its outbox retries
// them (M7-02, M9-14).

export interface Envelope {
  from: string
  to: string[]
}

export type Deliver = (envelope: Envelope, raw: Buffer) => Promise<void>

export interface Logger {
  info(message: string): void
  error(message: string): void
}

const MAX_SIZE = 25 * 1024 * 1024

interface SmtpLikeError extends Error {
  code?: string
  responseCode?: number
}

const isAuthError = (e: SmtpLikeError) => e.code === 'EAUTH' || e.responseCode === 535

/** Sends a message upstream with the current token; renews the token once if it is refused. */
export function createDeliver(
  upstream: RelayConfig['upstream'],
  tokens: TokenProvider,
  createTransport: typeof nodemailer.createTransport = nodemailer.createTransport,
): Deliver {
  const attempt = async (envelope: Envelope, raw: Buffer) => {
    const accessToken = await tokens.get()
    const transport = createTransport({
      host: upstream.host,
      port: upstream.port,
      secure: upstream.tls === 'tls',
      requireTLS: upstream.tls === 'starttls',
      ignoreTLS: upstream.tls === 'none',
      auth: { type: 'OAuth2', user: upstream.user, accessToken },
      connectionTimeout: 30_000,
      greetingTimeout: 30_000,
      socketTimeout: 60_000,
    })
    try {
      await transport.sendMail({ envelope: { from: envelope.from, to: envelope.to }, raw })
    } finally {
      transport.close()
    }
  }
  return async (envelope, raw) => {
    try {
      await attempt(envelope, raw)
    } catch (e) {
      if (!isAuthError(e as SmtpLikeError)) throw e
      tokens.invalidate()
      await attempt(envelope, raw)
    }
  }
}

/** The SMTP reply for a failed delivery: permanent upstream rejections stay permanent. */
export function smtpError(e: unknown): SmtpLikeError {
  const cause = e as SmtpLikeError
  const permanent =
    !(cause instanceof TokenError) &&
    !isAuthError(cause) &&
    typeof cause.responseCode === 'number' &&
    cause.responseCode >= 500
  const prefix = cause instanceof TokenError ? 'OAuth' : 'Microsoft 365'
  const error: SmtpLikeError = new Error(`${prefix}: ${cause.message ?? String(e)}`.slice(0, 400))
  error.responseCode = permanent ? cause.responseCode : 451
  return error
}

export function createRelay(deliver: Deliver, logger: Logger): SMTPServer {
  return new SMTPServer({
    banner: 'Judge26 mail relay',
    // Only PocketBase reaches the relay (compose network, no published port).
    authOptional: true,
    disabledCommands: ['AUTH', 'STARTTLS'],
    size: MAX_SIZE,
    logger: false,
    onData(stream, session, callback) {
      const chunks: Buffer[] = []
      stream.on('data', (chunk: Buffer) => chunks.push(chunk))
      stream.on('error', (e) => callback(smtpError(e)))
      stream.on('end', () => {
        if (stream.sizeExceeded) {
          const error: SmtpLikeError = new Error('Message too large')
          error.responseCode = 552
          return callback(error)
        }
        const mailFrom = session.envelope.mailFrom
        const envelope = {
          from: mailFrom ? mailFrom.address : '',
          to: session.envelope.rcptTo.map((r) => r.address),
        }
        deliver(envelope, Buffer.concat(chunks)).then(
          () => {
            logger.info(`Delivered a message to ${envelope.to.length} recipient(s).`)
            callback()
          },
          (e: unknown) => {
            const error = smtpError(e)
            logger.error(`Delivery failed (${error.responseCode}): ${error.message}`)
            callback(error)
          },
        )
      })
    },
  })
}
