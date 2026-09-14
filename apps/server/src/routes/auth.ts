/**
 * Authentication routes.
 *
 * Registration is rate limited hard, because invite codes are the only thing
 * between a stranger and an account: guessing one must be slow enough not to be
 * worth attempting. Login and refresh share a separate, looser limit.
 */

import type { FastifyInstance, FastifyPluginCallback, FastifyRequest } from 'fastify'

import { requireUser } from '../auth/guard.js'
import { guestLogin } from '../auth/guest.js'
import { login, logout, refreshSession } from '../auth/login.js'
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

  const loginRateLimit = {
    rateLimit: {
      max: config.LOGIN_RATE_LIMIT,
      timeWindow: config.LOGIN_RATE_WINDOW,
      keyGenerator: clientIp,
    },
  }

  const sessionContext = (request: FastifyRequest) => {
    const userAgent = request.headers['user-agent']
    return {
      ip: clientIp(request),
      ...(userAgent === undefined ? {} : { userAgent }),
      jwtSecret: config.JWT_SECRET,
    }
  }

  /** The refresh token from a JSON body, without trusting the body's shape. */
  const refreshTokenFrom = (body: unknown): unknown =>
    typeof body === 'object' && body !== null
      ? (body as { refreshToken?: unknown }).refreshToken
      : undefined

  app.post('/api/auth/login', { config: loginRateLimit }, async (request, reply) => {
    const result = await login(db, request.body, sessionContext(request))
    if (!result.ok) {
      if (result.reason === 'suspended') {
        return reply
          .status(403)
          .send({ errors: [{ field: 'form', message: 'This account is suspended.' }] })
      }
      // One message for both unknown username and wrong password.
      return reply
        .status(401)
        .send({ errors: [{ field: 'form', message: 'Wrong username or password.' }] })
    }
    return reply.status(200).send(result.session)
  })

  app.post('/api/auth/refresh', { config: loginRateLimit }, async (request, reply) => {
    const result = await refreshSession(db, refreshTokenFrom(request.body), sessionContext(request))
    if (!result.ok) {
      // The client's response to every failure is the same — show the login
      // screen — so the reason stays in the audit log rather than the reply.
      return reply
        .status(401)
        .send({ errors: [{ field: 'form', message: 'Please log in again.' }] })
    }
    return reply.status(200).send(result.session)
  })

  app.post('/api/auth/logout', async (request, reply) => {
    await logout(db, refreshTokenFrom(request.body))
    return reply.status(204).send()
  })

  app.post(
    '/api/auth/guest',
    {
      config: {
        rateLimit: {
          max: config.GUEST_RATE_LIMIT,
          timeWindow: config.GUEST_RATE_WINDOW,
          keyGenerator: clientIp,
        },
      },
    },
    async (request, reply) => {
      const result = await guestLogin(db, request.body, sessionContext(request))
      if (!result.ok) {
        if (result.reason === 'adopted') {
          // The client should forget the guest and show the login screen.
          return reply.status(409).send({
            errors: [{ field: 'form', message: 'This guest is now an account. Please log in.' }],
          })
        }
        return reply.status(400).send({ errors: [{ field: 'form', message: 'Invalid guest.' }] })
      }
      return reply.status(result.session.created ? 201 : 200).send(result.session)
    },
  )

  app.get('/api/me', async (request, reply) => {
    const claims = requireUser(request, reply, config.JWT_SECRET)
    if (!claims) return reply
    return reply.send({ user: { id: claims.sub, username: claims.username, role: claims.role } })
  })

  done()
}
