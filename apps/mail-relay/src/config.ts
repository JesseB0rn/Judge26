// Configuration of the mail relay (M9-D), from environment variables. See
// docs/operations/deployment.md#email-with-oauth-microsoft-365.

export type UpstreamTls = 'starttls' | 'tls' | 'none'

export interface RelayConfig {
  /** Where PocketBase connects (inside the compose network only). */
  listen: { host: string; port: number }
  /** Microsoft 365 SMTP AUTH endpoint. */
  upstream: { host: string; port: number; tls: UpstreamTls; user: string }
  oauth: { tokenUrl: string; clientId: string; clientSecret: string; scope: string }
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

export function loadConfig(env: Env = process.env): RelayConfig {
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
  const clientSecret = required('SMTP_OAUTH_CLIENT_SECRET')
  // The mailbox the app sends as; by default the sender address of the emails.
  const user = get('SMTP_OAUTH_USER') || get('MAIL_SENDER_ADDRESS')
  if (!user) missing.push('SMTP_OAUTH_USER (or MAIL_SENDER_ADDRESS)')
  if (missing.length) throw new ConfigError(`Missing settings: ${missing.join(', ')}.`)

  const tls = (get('SMTP_OAUTH_TLS') || 'starttls') as UpstreamTls
  if (!['starttls', 'tls', 'none'].includes(tls)) {
    throw new ConfigError(`SMTP_OAUTH_TLS must be starttls, tls or none, got "${tls}".`)
  }

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
      clientSecret,
      scope: get('SMTP_OAUTH_SCOPE') || 'https://outlook.office365.com/.default',
    },
  }
}
