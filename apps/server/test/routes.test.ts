import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance, InjectOptions } from 'fastify'

import { buildApp } from '../src/app.js'
import type { Config } from '../src/config.js'
import type { Database } from '../src/auth/register.js'
import { setUserStatus } from '../src/admin/index.js'
import { issueAccessToken } from '../src/auth/tokens.js'
import { users } from '../src/db/schema.js'
import {
  TEST_JWT_SECRET,
  createTestDb,
  resetDb,
  seedAccount,
  seedInvite,
  validRegistration,
} from './support/db.js'
import type { TestDb } from './support/db.js'

/**
 * Routes are exercised through `app.inject()`: no port, no network, but the
 * real routing, the real rate limiter and the real handlers, against a real
 * (embedded) Postgres.
 */

const testConfig = (overrides: Partial<Config> = {}): Config => ({
  DATABASE_URL: 'postgres://unused',
  PORT: 0,
  HOST: '127.0.0.1',
  NODE_ENV: 'test',
  LOG_LEVEL: 'fatal', // keep the test output readable
  REGISTER_RATE_LIMIT: 100, // high enough not to interfere unless a test wants it
  REGISTER_RATE_WINDOW: '1 minute',
  REVEAL_DUPLICATES: true,
  JWT_SECRET: TEST_JWT_SECRET,
  LOGIN_RATE_LIMIT: 100,
  LOGIN_RATE_WINDOW: '1 minute',
  ...overrides,
})

let harness: TestDb
let db: Database
let app: FastifyInstance

async function start(config: Partial<Config> = {}): Promise<void> {
  app = await buildApp({ db, config: testConfig(config) })
  await app.ready()
}

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db
})

beforeEach(async () => {
  await resetDb(db)
})

// The app is rebuilt per test because several tests want a different rate
// limit, and a limiter carries state. The database is shared and truncated.
afterEach(async () => {
  await app?.close()
})

afterAll(async () => {
  await harness?.close()
})

/** `exactOptionalPropertyTypes` will not accept an optional-typed payload here. */
type Payload = NonNullable<InjectOptions['payload']>

const post = (payload: Payload, headers: Record<string, string> = {}) =>
  app.inject({ method: 'POST', url: '/api/auth/register', payload, headers })

describe('GET /health', () => {
  it('answers without touching the database', async () => {
    await start()
    const response = await app.inject({ method: 'GET', url: '/health' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ status: 'ok' })
  })
})

describe('POST /api/auth/register', () => {
  it('creates an account and returns 201', async () => {
    await start()
    const invite = await seedInvite(db)
    const response = await post(validRegistration({ inviteCode: invite.code }))

    expect(response.statusCode).toBe(201)
    const body = JSON.parse(response.body) as { user: { id: string; username: string } }
    expect(body.user.username).toBe('muffy')
    expect(body.user.id).toBeTruthy()
  })

  it('does not echo the email back', async () => {
    await start()
    const invite = await seedInvite(db)
    const response = await post(validRegistration({ inviteCode: invite.code }))
    expect(response.body).not.toContain('muffy@example.com')
  })

  it('never returns the password in any form', async () => {
    await start()
    const invite = await seedInvite(db)
    const response = await post(validRegistration({ inviteCode: invite.code }))
    expect(response.body).not.toContain('correct1horse')
    expect(response.body).not.toContain('argon2')
  })

  it('returns 400 with field errors a form can render', async () => {
    await start()
    const response = await post({
      username: 'x',
      email: 'nope',
      password: 'short',
      inviteCode: '',
      acceptedTerms: false,
    })

    expect(response.statusCode).toBe(400)
    const body = JSON.parse(response.body) as { errors: { field: string; message: string }[] }
    const fields = new Set(body.errors.map((e) => e.field))
    expect(fields).toContain('username')
    expect(fields).toContain('password')
    for (const error of body.errors) {
      expect(error.message.length).toBeGreaterThan(0)
    }
  })

  it('rejects a bad invite code without creating anything', async () => {
    await start()
    const response = await post(validRegistration({ inviteCode: 'NOTREAL123' }))
    expect(response.statusCode).toBe(400)
    expect(await db.select().from(users)).toHaveLength(0)
  })

  it('handles valid JSON of the wrong shape', async () => {
    await start()
    for (const payload of ['null', '42', '"text"', '[]']) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        headers: { 'content-type': 'application/json' },
        payload,
      })
      expect(response.statusCode).toBe(400)
      expect(response.json()).toHaveProperty('errors')
    }
  })

  it('refuses a body that is not JSON, in the standard error shape', async () => {
    await start()
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      headers: { 'content-type': 'text/plain' },
      payload: 'hello',
    })
    // The exact code is Fastify's to choose; what matters is that it blames the
    // client, never the server, and answers in the shape the client parses.
    expect(response.statusCode).toBeGreaterThanOrEqual(400)
    expect(response.statusCode).toBeLessThan(500)
    expect(response.json()).toHaveProperty('errors')
  })

  it('handles malformed JSON without a 500', async () => {
    await start()
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      headers: { 'content-type': 'application/json' },
      payload: '{ not json',
    })
    expect(response.statusCode).toBe(400)
  })
})

const postJson = (url: string, payload: Payload, headers: Record<string, string> = {}) =>
  app.inject({ method: 'POST', url, payload, headers })

interface SessionBody {
  accessToken: string
  refreshToken: string
  expiresIn: number
  user: { id: string; username: string; role: string }
}

describe('login, refresh, logout and /api/me', () => {
  it('logs in, reaches /api/me with the access token, refreshes, and logs out', async () => {
    await start()
    const account = await seedAccount(db)

    const loginResponse = await postJson('/api/auth/login', {
      username: 'MUFFY',
      password: account.password,
    })
    expect(loginResponse.statusCode).toBe(200)
    const session = JSON.parse(loginResponse.body) as SessionBody
    expect(session.expiresIn).toBe(900)
    expect(loginResponse.body).not.toContain('argon2')

    const me = await app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { authorization: `Bearer ${session.accessToken}` },
    })
    expect(me.statusCode).toBe(200)
    expect(me.json()).toEqual({ user: { id: account.id, username: 'muffy', role: 'player' } })

    const refreshed = await postJson('/api/auth/refresh', { refreshToken: session.refreshToken })
    expect(refreshed.statusCode).toBe(200)
    const next = JSON.parse(refreshed.body) as SessionBody

    const out = await postJson('/api/auth/logout', { refreshToken: next.refreshToken })
    expect(out.statusCode).toBe(204)

    const afterLogout = await postJson('/api/auth/refresh', { refreshToken: next.refreshToken })
    expect(afterLogout.statusCode).toBe(401)
  })

  it('answers unknown user and wrong password with the same 401 body', async () => {
    await start()
    await seedAccount(db)
    const unknown = await postJson('/api/auth/login', {
      username: 'nobody',
      password: 'correct1horse',
    })
    const wrong = await postJson('/api/auth/login', { username: 'muffy', password: 'wrong1horse' })
    expect(unknown.statusCode).toBe(401)
    expect(wrong.statusCode).toBe(401)
    expect(wrong.body).toBe(unknown.body)
  })

  it('answers 403 for a suspended account with the right password', async () => {
    await start()
    const account = await seedAccount(db)
    await setUserStatus(db, 'muffy', 'suspended')
    const response = await postJson('/api/auth/login', {
      username: 'muffy',
      password: account.password,
    })
    expect(response.statusCode).toBe(403)
  })

  it('refuses /api/me without a valid token', async () => {
    await start()
    const forged = issueAccessToken(
      { sub: 'x', username: 'x', role: 'admin' },
      'not-the-server-secret-but-long-enough',
    )
    for (const authorization of [undefined, 'Bearer', 'Bearer junk', `Bearer ${forged}`, forged]) {
      const response = await app.inject({
        method: 'GET',
        url: '/api/me',
        headers: authorization === undefined ? {} : { authorization },
      })
      expect(response.statusCode).toBe(401)
      expect(response.json()).toHaveProperty('errors')
    }
  })

  it('refuses refresh bodies of the wrong shape with 401, not 500', async () => {
    await start()
    for (const payload of [{}, { refreshToken: 42 }, { refreshToken: '' }]) {
      expect((await postJson('/api/auth/refresh', payload)).statusCode).toBe(401)
    }
    const nullBody = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      headers: { 'content-type': 'application/json' },
      payload: 'null',
    })
    expect(nullBody.statusCode).toBe(401)
  })

  it('rate limits login attempts per address', async () => {
    await start({ LOGIN_RATE_LIMIT: 3, LOGIN_RATE_WINDOW: '1 minute' })
    const attempt = () =>
      postJson(
        '/api/auth/login',
        { username: 'muffy', password: 'wrong1horse' },
        { 'x-forwarded-for': '203.0.113.7' },
      )
    for (let i = 0; i < 3; i += 1) expect((await attempt()).statusCode).toBe(401)
    expect((await attempt()).statusCode).toBe(429)
  })
})

describe('rate limiting', () => {
  it('blocks repeated attempts from one address', async () => {
    // Invite codes are the only thing between a stranger and an account, so
    // guessing them has to be slow.
    await start({ REGISTER_RATE_LIMIT: 3, REGISTER_RATE_WINDOW: '1 minute' })

    const attempt = () =>
      post(validRegistration({ inviteCode: 'WRONGCODE1' }), { 'x-forwarded-for': '203.0.113.5' })

    for (let i = 0; i < 3; i += 1) {
      expect((await attempt()).statusCode).toBe(400)
    }
    expect((await attempt()).statusCode).toBe(429)
  })

  it('counts each address separately, not everyone behind the proxy together', async () => {
    // Without trustProxy this would throttle every player at once, because all
    // requests arrive from Caddy.
    await start({ REGISTER_RATE_LIMIT: 2, REGISTER_RATE_WINDOW: '1 minute' })

    const from = (ip: string) =>
      post(validRegistration({ inviteCode: 'WRONGCODE1' }), { 'x-forwarded-for': ip })

    await from('203.0.113.1')
    await from('203.0.113.1')
    expect((await from('203.0.113.1')).statusCode).toBe(429)
    // A different player is unaffected.
    expect((await from('203.0.113.2')).statusCode).toBe(400)
  })

  it('leaves /health alone — a throttled monitor is a false alarm', async () => {
    await start({ REGISTER_RATE_LIMIT: 1, REGISTER_RATE_WINDOW: '1 minute' })
    for (let i = 0; i < 5; i += 1) {
      const response = await app.inject({ method: 'GET', url: '/health' })
      expect(response.statusCode).toBe(200)
    }
  })
})
