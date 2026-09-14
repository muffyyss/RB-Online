/**
 * Requiring a logged-in player on a route.
 *
 * Checks the access token only — no database round trip. That is the trade the
 * short token lifetime buys: a suspension takes up to fifteen minutes to bite,
 * and in exchange every authenticated request costs one HMAC.
 */

import type { FastifyReply, FastifyRequest } from 'fastify'

import { verifyAccessToken } from './tokens.js'
import type { AccessTokenClaims } from './tokens.js'

/** The bearer token from an `Authorization` header, or null. */
export function bearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization
  if (typeof header !== 'string') return null
  const match = /^Bearer\s+(\S+)$/i.exec(header)
  return match?.[1] ?? null
}

/**
 * Resolve the caller from their access token, or answer 401 and return null.
 *
 * Every failure gets the same response. A client only needs to know "refresh
 * and try again"; telling it *why* a token was refused helps nobody but a
 * forger.
 *
 * When this returns null the reply is already sent; the handler should
 * `return reply` straight away.
 */
export function requireUser(
  request: FastifyRequest,
  reply: FastifyReply,
  secret: string,
): AccessTokenClaims | null {
  const token = bearerToken(request)
  const result = token === null ? null : verifyAccessToken(token, secret)
  if (!result?.ok) {
    void reply.status(401).send({ errors: [{ field: 'form', message: 'Please log in again.' }] })
    return null
  }
  return result.claims
}
