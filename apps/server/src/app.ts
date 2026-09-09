/**
 * Building the HTTP server.
 *
 * `buildApp` takes its database rather than opening one, so tests can hand it
 * an embedded Postgres and drive it through `app.inject()` — no port, no
 * network, but the real routing, the real rate limiter and the real handlers.
 */

import rateLimit from '@fastify/rate-limit'
import Fastify from 'fastify'
import type { FastifyInstance } from 'fastify'

import type { Database } from './auth/register.js'
import type { Config } from './config.js'
import { authRoutes } from './routes/auth.js'

export interface AppOptions {
  readonly db: Database
  readonly config: Config
}

export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const { db, config } = options

  const app = Fastify({
    logger: { level: config.LOG_LEVEL },
    // Caddy sits in front and terminates TLS, so the client address arrives in
    // X-Forwarded-For. Without this every request looks like it came from the
    // proxy and rate limiting would throttle all players together.
    trustProxy: true,
    // A registration body is small; anything larger is not a registration.
    bodyLimit: 16 * 1024,
  })

  await app.register(rateLimit, {
    global: false, // opted into per route, so a slow endpoint cannot throttle a fast one
    max: config.REGISTER_RATE_LIMIT,
    timeWindow: config.REGISTER_RATE_WINDOW,
  })

  /** Liveness check for the uptime monitor. Deliberately touches nothing. */
  app.get('/health', () => ({ status: 'ok' }))

  await app.register(authRoutes, { db, config })

  app.setErrorHandler((error: unknown, request, reply) => {
    const fastifyError = error as { statusCode?: number; code?: string; message?: string }
    // A body Fastify cannot parse is the client's fault and says nothing useful
    // in a log. Matched on the code rather than the status, because this one
    // carries 415, not 400.
    if (fastifyError.code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE') {
      return reply.status(415).send({ errors: [{ field: 'form', message: 'Send JSON.' }] })
    }
    if (fastifyError.statusCode && fastifyError.statusCode < 500) {
      return reply
        .status(fastifyError.statusCode)
        .send({ errors: [{ field: 'form', message: fastifyError.message ?? 'Invalid request.' }] })
    }

    request.log.error({ err: error }, 'unhandled error')
    // Never let an internal message reach the client: stack traces and driver
    // errors leak schema details.
    return reply.status(500).send({
      errors: [{ field: 'form', message: 'Something went wrong. Please try again.' }],
    })
  })

  return app
}
