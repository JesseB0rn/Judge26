// Configuration of the mail relay (M9-D), from environment variables. See
// docs/operations/deployment.md#email-with-oauth-microsoft-365.
//
// The relay authenticates to the token endpoint with a client secret (M9-12) or with a
// certificate credential (M10-37): an X.509 certificate and its RSA private key, as PEM files.
// Exactly one of the two must be set. Certificate files are checked at start (M10-39).

import { readFileSync } from 'node:fs'
import { createPrivateKey, X509Certificate, type KeyObject } from 'node:crypto'

export type UpstreamTls = 'starttls' | 'tls' | 'none'

/** How the relay proves its identity to the token endpoint. */
export type OAuthCredential =
  | { kind: 'secret'; secret: string }
  | { kind: 'certificate'; certificate: X509Certificate; privateKey: KeyObject }

/** A certificate expiring within this time is logged as a warning (M10-39). */
export const EXPIRY_WARNING_MS = 30 * 24 * 60 * 60_000

export interface RelayConfig {
  /** Where PocketBase connects (inside the compose network only). */
  listen: { host: string; port: number }
  /** Microsoft 365 SMTP AUTH endpoint. */
  upstream: { host: string; port: number; tls: UpstreamTls; user: string }
  oauth: { tokenUrl: string; clientId: string; credential: OAuthCredential; scope: string }
  /** Problems that do not stop the relay, logged at start (e.g. a certificate expiring soon). */
  warnings: string[]
}

interface LoadOptions {
  readFile?: (path: string) => string
  now?: () => number
}

export class ConfigError extends Error {}

type Env = Record<string, string | undefined>

function port(env: Env, name: string, fallback: number) {
  const raw = env[name]?.trim()
  if (!raw) return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new ConfigError(`${name} must be a port number, got "${raw}".`)
  }
  return value
}

export function loadConfig(
  env: Env = process.env,
  { readFile = (path) => readFileSync(path, 'utf8'), now = Date.now }: LoadOptions = {},
): RelayConfig {
  const get = (name: string) => env[name]?.trim() ?? ''
  const missing: string[] = []
  const required = (name: string, value = get(name)) => {
    if (!value) missing.push(name)
    return value
  }

  const tenant = get('SMTP_OAUTH_TENANT_ID')
  const tokenUrl =
    get('SMTP_OAUTH_TOKEN_URL') ||
    (tenant
      ? `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`
      : '')
  if (!tokenUrl) missing.push('SMTP_OAUTH_TENANT_ID')
  const clientId = required('SMTP_OAUTH_CLIENT_ID')
  const secret = get('SMTP_OAUTH_CLIENT_SECRET')
  const certificateFile = get('SMTP_OAUTH_CERTIFICATE_FILE')
  const keyFile = get('SMTP_OAUTH_PRIVATE_KEY_FILE')
  const usesCertificate = !!(certificateFile || keyFile)
  if (secret && usesCertificate) {
    throw new ConfigError(
      'Set either SMTP_OAUTH_CLIENT_SECRET or SMTP_OAUTH_CERTIFICATE_FILE and SMTP_OAUTH_PRIVATE_KEY_FILE, not both.',
    )
  }
  if (!usesCertificate && !secret) missing.push('SMTP_OAUTH_CLIENT_SECRET')
  if (usesCertificate) {
    if (!certificateFile) missing.push('SMTP_OAUTH_CERTIFICATE_FILE')
    if (!keyFile) missing.push('SMTP_OAUTH_PRIVATE_KEY_FILE')
  }
  // The mailbox the app sends as; by default the sender address of the emails.
  const user = get('SMTP_OAUTH_USER') || get('MAIL_SENDER_ADDRESS')
  if (!user) missing.push('SMTP_OAUTH_USER (or MAIL_SENDER_ADDRESS)')
  if (missing.length) throw new ConfigError(`Missing settings: ${missing.join(', ')}.`)

  const tls = (get('SMTP_OAUTH_TLS') || 'starttls') as UpstreamTls
  if (!['starttls', 'tls', 'none'].includes(tls)) {
    throw new ConfigError(`SMTP_OAUTH_TLS must be starttls, tls or none, got "${tls}".`)
  }

  const warnings: string[] = []
  const credential: OAuthCredential = usesCertificate
    ? loadCertificate(
        { certificateFile, keyFile, passphrase: env.SMTP_OAUTH_PRIVATE_KEY_PASSPHRASE },
        readFile,
        now(),
        warnings,
      )
    : { kind: 'secret', secret }

  return {
    listen: { host: get('RELAY_HOST') || '0.0.0.0', port: port(env, 'RELAY_PORT', 2525) },
    upstream: {
      host: get('SMTP_OAUTH_HOST') || 'smtp.office365.com',
      port: port(env, 'SMTP_OAUTH_PORT', 587),
      tls,
      user,
    },
    oauth: {
      tokenUrl,
      clientId,
      credential,
      scope: get('SMTP_OAUTH_SCOPE') || 'https://outlook.office365.com/.default',
    },
    warnings,
  }
}

/**
 * Reads and checks the certificate credential (M10-39): both files readable and valid PEM, an RSA
 * key that belongs to the certificate, and a certificate that is valid now. Error messages name
 * the setting and never contain the key.
 */
function loadCertificate(
  files: { certificateFile: string; keyFile: string; passphrase?: string },
  readFile: (path: string) => string,
  now: number,
  warnings: string[],
): OAuthCredential {
  const read = (name: string, path: string) => {
    try {
      return readFile(path)
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code
      throw new ConfigError(`${name}: cannot read "${path}"${code ? ` (${code})` : ''}.`)
    }
  }
  let certificate: X509Certificate
  try {
    certificate = new X509Certificate(read('SMTP_OAUTH_CERTIFICATE_FILE', files.certificateFile))
  } catch (e) {
    if (e instanceof ConfigError) throw e
    throw new ConfigError(
      `SMTP_OAUTH_CERTIFICATE_FILE: "${files.certificateFile}" is not a PEM X.509 certificate.`,
    )
  }
  let privateKey: KeyObject
  try {
    privateKey = createPrivateKey({
      key: read('SMTP_OAUTH_PRIVATE_KEY_FILE', files.keyFile),
      ...(files.passphrase ? { passphrase: files.passphrase } : {}),
    })
  } catch (e) {
    if (e instanceof ConfigError) throw e
    // The library's message may quote parts of the file: never pass it on.
    throw new ConfigError(
      `SMTP_OAUTH_PRIVATE_KEY_FILE: "${files.keyFile}" is not a readable PEM private key (encrypted keys need SMTP_OAUTH_PRIVATE_KEY_PASSPHRASE).`,
    )
  }
  if (privateKey.asymmetricKeyType !== 'rsa') {
    throw new ConfigError('SMTP_OAUTH_PRIVATE_KEY_FILE: the key must be an RSA key.')
  }
  if (!certificate.checkPrivateKey(privateKey)) {
    throw new ConfigError(
      'SMTP_OAUTH_PRIVATE_KEY_FILE does not belong to the certificate in SMTP_OAUTH_CERTIFICATE_FILE.',
    )
  }
  const validFrom = Date.parse(certificate.validFrom)
  const validTo = Date.parse(certificate.validTo)
  if (now < validFrom) {
    throw new ConfigError(
      `SMTP_OAUTH_CERTIFICATE_FILE: the certificate is not valid before ${certificate.validFrom}.`,
    )
  }
  if (now >= validTo) {
    throw new ConfigError(
      `SMTP_OAUTH_CERTIFICATE_FILE: the certificate expired on ${certificate.validTo}. Create a new one and upload it to the app registration.`,
    )
  }
  if (validTo - now < EXPIRY_WARNING_MS) {
    const days = Math.ceil((validTo - now) / 86_400_000)
    warnings.push(
      `The certificate in SMTP_OAUTH_CERTIFICATE_FILE expires in ${days} day(s) (${certificate.validTo}). Renew it and upload the new one to the app registration.`,
    )
  }
  return { kind: 'certificate', certificate, privateKey }
}
