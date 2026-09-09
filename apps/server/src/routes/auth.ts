/**
 * Authentication routes.
 *
 * Registration is the only endpoint here so far. It is rate limited hard,
 * because invite codes are the only thing between a stranger and an account:
 * guessing one must be slow enough not to be worth attempting.
 */

import type { FastifyInstance, FastifyPluginCallback, FastifyRequest } from 'fastify'

import { registerUser } from '../auth/register.js'
import type { Database } from '../auth/register.js'
import type { Config } from '../config.js'

export interface AuthRouteOptions {
  readonly db: Database
  readonly config: Config
}

/**
 * The caller's address, honouring a reverse proxy.
 *
 * With `trustProxy` on, Fastify has already resolved `request.ip` to the real
 * client from `X-Forwarded-For` — that is the whole point of the option.
 *
 * Do not reach for `request.ips[0]`: that array starts at the *socket* address,
 * which behind Caddy is always the proxy. Keying the rate limiter on it gives
 * every player one shared bucket, so the first few registrations of the day
 * would lock out everyone else. There is a test for exactly this.
 */
function clientIp(request: FastifyRequest): string {
  return request.ip
}

export const authRoutes: FastifyPluginCallback<AuthRouteOptions> = (
  app: FastifyInstance,
  options: AuthRouteOptions,
  done: (error?: Error) => void,
) => {
  const { db, config } = options

  app.post(
    '/api/auth/register',
    {
      config: {
        rateLimit: {
          max: config.REGISTER_RATE_LIMIT,
          timeWindow: config.REGISTER_RATE_WINDOW,
          keyGenerator: clientIp,
        },
      },
    },
    async (request, reply) => {
      const userAgent = request.headers['user-agent']
      const result = await registerUser(db, request.body, {
        ip: clientIp(request),
        ...(userAgent === undefined ? {} : { userAgent }),
        revealDuplicates: config.REVEAL_DUPLICATES,
      })

      if (!result.ok) {
        // 400 rather than 422: these are ordinary form errors, and the client
        // renders them against the fields they name.
        return reply.status(400).send({ errors: result.errors })
      }

      // The email is deliberately not echoed back. Nothing needs it, and an
      // account-creation response is a bad place to repeat one.
      return reply.status(201).send({
        user: { id: result.user.id, username: result.user.username },
      })
    },
  )

  done()
}
