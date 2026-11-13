import type { RelayConfig } from './config.ts'

// OAuth 2.0 client credentials (M9-13): an access token for SMTP AUTH XOAUTH2, fetched once and
// reused until shortly before it expires. The client secret never leaves this module and is
// never part of an error message.

/** Renew this long before the token expires, so a message never goes out with a stale one. */
export const RENEW_BEFORE_MS = 5 * 60_000

export class TokenError extends Error {}

export interface TokenProvider {
  get(): Promise<string>
  /** Forget the cached token (after the mail server refused it). */
  invalidate(): void
}

interface Options {
  fetch?: typeof globalThis.fetch
  now?: () => number
}

export function createTokenProvider(
  oauth: RelayConfig['oauth'],
  { fetch = globalThis.fetch, now = Date.now }: Options = {},
): TokenProvider {
  let cached: { token: string; expiresAt: number } | undefined
  let pending: Promise<string> | undefined

  async function request(): Promise<string> {
    let response: Response
    try {
      response = await fetch(oauth.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: oauth.clientId,
          client_secret: oauth.clientSecret,
          scope: oauth.scope,
        }),
        signal: AbortSignal.timeout(15_000),
      })
    } catch (e) {
      throw new TokenError(`Token endpoint not reachable: ${(e as Error).message}`)
    }
    const body = (await response.json().catch(() => ({}))) as {
      access_token?: string
      expires_in?: number | string
      error?: string
      error_description?: string
    }
    if (!response.ok || !body.access_token) {
      // Microsoft's descriptions are multi-line (trace ids); the first line says what is wrong.
      const detail = [body.error, body.error_description?.split(/\r?\n/)[0]]
        .filter(Boolean)
        .join(': ')
      throw new TokenError(
        `Token request failed (HTTP ${response.status})${detail ? `: ${detail}` : ''}`,
      )
    }
    const seconds = Number(body.expires_in) || 3600
    cached = { token: body.access_token, expiresAt: now() + seconds * 1000 }
    return body.access_token
  }

  return {
    async get() {
      if (cached && cached.expiresAt - RENEW_BEFORE_MS > now()) return cached.token
      // Messages arriving together share one token request.
      pending ??= request().finally(() => (pending = undefined))
      return pending
    },
    invalidate() {
      cached = undefined
    },
  }
}
