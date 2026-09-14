/**
 * Issuing and checking tokens.
 *
 * The JWT is signed and verified by hand with `node:crypto` rather than pulling
 * in a library. HS256 is a SHA-256 HMAC over two base64url segments, the whole
 * thing is about thirty lines, and writing it here means the verification path
 * — where the actual security lives — is readable in one sitting.
 *
 * The rules that matter, and that a careless implementation gets wrong:
 *
 *  - The signature is compared in **constant time**. A byte-by-byte compare
 *    leaks the correct signature one byte at a time.
 *  - The algorithm in the header is **ignored**. A token claiming `alg: none`
 *    or `alg: RS256` must not change how we verify; we only ever check HS256.
 *    This is the classic JWT vulnerability.
 *  - Expiry is checked, and a token with no `exp` is rejected rather than
 *    treated as eternal.
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/** How long an access token lasts. Short, because it cannot be revoked. */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60

/** How long a refresh token lasts. Long, because it can be revoked. */
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60

export interface AccessTokenClaims {
  /** Subject: the user id. */
  readonly sub: string
  readonly username: string
  readonly role: string
  /** Issued at, seconds since epoch. */
  readonly iat: number
  /** Expires at, seconds since epoch. */
  readonly exp: number
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function fromBase64url(input: string): Buffer {
  return Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

function sign(payload: string, secret: string): string {
  return base64url(createHmac('sha256', secret).update(payload).digest())
}

/**
 * Mint an access token.
 *
 * `now` is a parameter so tests can move time without waiting for it.
 */
export function issueAccessToken(
  claims: { sub: string; username: string; role: string },
  secret: string,
  now: number = Date.now(),
): string {
  const issuedAt = Math.floor(now / 1000)
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = base64url(
    JSON.stringify({
      ...claims,
      iat: issuedAt,
      exp: issuedAt + ACCESS_TOKEN_TTL_SECONDS,
    }),
  )
  const payload = `${header}.${body}`
  return `${payload}.${sign(payload, secret)}`
}

export type TokenFailure = 'malformed' | 'bad-signature' | 'expired'

export type VerifyResult =
  | { readonly ok: true; readonly claims: AccessTokenClaims }
  | { readonly ok: false; readonly reason: TokenFailure }

/**
 * Verify an access token.
 *
 * Note what is *not* consulted: the `alg` field of the header. We decide the
 * algorithm, not the token — otherwise a forged header saying `alg: none` would
 * talk us out of checking the signature at all.
 */
export function verifyAccessToken(
  token: string,
  secret: string,
  now: number = Date.now(),
): VerifyResult {
  const parts = token.split('.')
  if (parts.length !== 3) return { ok: false, reason: 'malformed' }
  const [header, body, signature] = parts
  if (!header || !body || !signature) return { ok: false, reason: 'malformed' }

  const expected = sign(`${header}.${body}`, secret)
  const given = Buffer.from(signature, 'utf8')
  const want = Buffer.from(expected, 'utf8')
  // Length must match before timingSafeEqual, which throws on a mismatch.
  if (given.length !== want.length) return { ok: false, reason: 'bad-signature' }
  if (!timingSafeEqual(given, want)) return { ok: false, reason: 'bad-signature' }

  let claims: AccessTokenClaims
  try {
    claims = JSON.parse(fromBase64url(body).toString('utf8')) as AccessTokenClaims
  } catch {
    return { ok: false, reason: 'malformed' }
  }

  if (typeof claims.sub !== 'string' || typeof claims.exp !== 'number') {
    // A token without an expiry is rejected, never treated as eternal.
    return { ok: false, reason: 'malformed' }
  }
  if (claims.exp * 1000 <= now) return { ok: false, reason: 'expired' }

  return { ok: true, claims }
}

/**
 * A refresh token: 256 bits of randomness, and nothing else.
 *
 * Deliberately opaque. It carries no claims, so there is nothing in it to
 * tamper with — its only meaning is the row it matches in the database.
 */
export function generateRefreshToken(): string {
  return base64url(randomBytes(32))
}

/**
 * Hash a refresh token for storage.
 *
 * SHA-256, not argon2, for the same reason as invite codes: refresh lookups
 * need to *find* a row by hash, which needs a deterministic hash, and a 256-bit
 * random string has no dictionary to attack.
 */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/**
 * A short, human-readable device label from a user agent.
 *
 * Only so a future session list reads as "Windows" rather than a 200-character
 * UA string. Never used for a security decision — a user agent is whatever the
 * client says it is.
 */
export function deviceLabel(userAgent: string | undefined): string | null {
  if (!userAgent) return null
  const known = ['Windows', 'Macintosh', 'Linux', 'Android', 'iPhone', 'iPad']
  return known.find((name) => userAgent.includes(name)) ?? 'Unknown'
}
