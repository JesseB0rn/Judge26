import {
  createHash,
  randomUUID,
  sign,
  constants,
  type KeyObject,
  type X509Certificate,
} from 'node:crypto'

// Client assertion for OAuth 2.0 client credentials with a certificate (M10-37, M10-38; RFC 7523,
// Microsoft identity platform "certificate credentials"): a short-lived JWT signed with the
// certificate's private key (PS256), naming the certificate by its SHA-256 thumbprint.

/** Lifetime of an assertion (M10-38: at most 10 minutes). */
export const ASSERTION_LIFETIME_S = 10 * 60

const base64url = (data: Buffer | string) => Buffer.from(data).toString('base64url')

/** SHA-256 thumbprint of the certificate (DER), base64url: the `x5t#S256` header. */
export function thumbprintS256(certificate: X509Certificate) {
  return base64url(createHash('sha256').update(certificate.raw).digest())
}

export function createClientAssertion(options: {
  tokenUrl: string
  clientId: string
  certificate: X509Certificate
  privateKey: KeyObject
  now?: number
}) {
  const iat = Math.floor((options.now ?? Date.now()) / 1000)
  const header = { alg: 'PS256', typ: 'JWT', 'x5t#S256': thumbprintS256(options.certificate) }
  const payload = {
    aud: options.tokenUrl,
    iss: options.clientId,
    sub: options.clientId,
    // A new id every time, so an assertion is never used twice.
    jti: randomUUID(),
    iat,
    nbf: iat,
    exp: iat + ASSERTION_LIFETIME_S,
  }
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`
  const signature = sign('sha256', Buffer.from(signingInput), {
    key: options.privateKey,
    padding: constants.RSA_PKCS1_PSS_PADDING,
    saltLength: constants.RSA_PSS_SALTLEN_DIGEST,
  })
  return `${signingInput}.${base64url(signature)}`
}
