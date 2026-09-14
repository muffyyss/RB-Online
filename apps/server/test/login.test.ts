import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'

import { setUserStatus } from '../src/admin/index.js'
import { login, logout, refreshSession } from '../src/auth/login.js'
import type { Database } from '../src/auth/register.js'
import { hashRefreshToken, verifyAccessToken } from '../src/auth/tokens.js'
import { auditLog } from '../src/db/schema.js'
import { refreshTokens } from '../src/db/sessions.js'
import { TEST_JWT_SECRET, createTestDb, resetDb, seedAccount } from './support/db.js'
import type { TestDb } from './support/db.js'

let harness: TestDb
let db: Database

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db
})

beforeEach(async () => {
  await resetDb(db)
})

afterAll(async () => {
  await harness?.close()
})

const context = { ip: '203.0.113.9', userAgent: 'Windows Electron', jwtSecret: TEST_JWT_SECRET }

async function loggedIn(username = 'muffy') {
  const account = await seedAccount(db, username)
  const result = await login(db, { username, password: account.password }, context)
  if (!result.ok) throw new Error('seed login failed')
  return { account, session: result.session }
}

async function auditEvents(): Promise<string[]> {
  return (await db.select().from(auditLog)).map((row) => row.event)
}

describe('login', () => {
  it('returns a session whose access token verifies', async () => {
    const { account, session } = await loggedIn()
    const verified = verifyAccessToken(session.accessToken, TEST_JWT_SECRET)
    expect(verified.ok).toBe(true)
    if (!verified.ok) return
    expect(verified.claims.sub).toBe(account.id)
    expect(session.user).toEqual({ id: account.id, username: 'muffy', role: 'player' })
  })

  it('matches the username in any casing', async () => {
    const account = await seedAccount(db, 'Muffy')
    const result = await login(db, { username: '  MUFFY ', password: account.password }, context)
    expect(result.ok).toBe(true)
    // The stored spelling comes back, not whatever was typed.
    if (result.ok) expect(result.session.user.username).toBe('Muffy')
  })

  it('stores only the hash of the refresh token', async () => {
    const { session } = await loggedIn()
    const rows = await db.select().from(refreshTokens)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.tokenHash).toBe(hashRefreshToken(session.refreshToken))
    expect(JSON.stringify(rows)).not.toContain(session.refreshToken)
    expect(rows[0]?.deviceLabel).toBe('Windows')
  })

  it('gives the same answer for an unknown username and a wrong password', async () => {
    await seedAccount(db)
    const unknown = await login(db, { username: 'nobody', password: 'correct1horse' }, context)
    const wrong = await login(db, { username: 'muffy', password: 'wrong1horse' }, context)
    expect(unknown).toEqual({ ok: false, reason: 'invalid-credentials' })
    expect(wrong).toEqual(unknown)
    // The difference is kept, but only where an admin can see it.
    expect(await auditEvents()).toEqual(
      expect.arrayContaining(['login.unknown_user', 'login.wrong_password']),
    )
  })

  it('does not reveal a suspension to someone without the password', async () => {
    const account = await seedAccount(db)
    await setUserStatus(db, 'muffy', 'suspended')

    expect(await login(db, { username: 'muffy', password: 'wrong1horse' }, context)).toEqual({
      ok: false,
      reason: 'invalid-credentials',
    })
    expect(await login(db, { username: 'muffy', password: account.password }, context)).toEqual({
      ok: false,
      reason: 'suspended',
    })
    expect(await db.select().from(refreshTokens)).toHaveLength(0)
  })

  it('handles input of the wrong shape', async () => {
    for (const input of [null, 42, 'text', [], {}, { username: 'muffy' }, { password: 1 }]) {
      expect(await login(db, input, context)).toEqual({ ok: false, reason: 'invalid-credentials' })
    }
  })

  it('starts a separate family for each login, so devices log out independently', async () => {
    const account = await seedAccount(db)
    await login(db, { username: 'muffy', password: account.password }, context)
    await login(db, { username: 'muffy', password: account.password }, context)
    const families = new Set((await db.select().from(refreshTokens)).map((row) => row.familyId))
    expect(families.size).toBe(2)
  })
})

describe('refreshing', () => {
  it('rotates: a new refresh token, and the old one stops working', async () => {
    const { session } = await loggedIn()
    const first = await refreshSession(db, session.refreshToken, context)
    expect(first.ok).toBe(true)
    if (!first.ok) return
    expect(first.session.refreshToken).not.toBe(session.refreshToken)
    expect(verifyAccessToken(first.session.accessToken, TEST_JWT_SECRET).ok).toBe(true)

    // The rotated token keeps working in turn.
    const second = await refreshSession(db, first.session.refreshToken, context)
    expect(second.ok).toBe(true)
  })

  it('treats reuse of a rotated token as theft and revokes the whole family', async () => {
    const { session } = await loggedIn()
    const rotated = await refreshSession(db, session.refreshToken, context)
    if (!rotated.ok) throw new Error('rotation failed')

    // Someone replays the original token.
    expect(await refreshSession(db, session.refreshToken, context)).toEqual({
      ok: false,
      reason: 'reused',
    })
    // The legitimate holder's newer token is dead too.
    expect(await refreshSession(db, rotated.session.refreshToken, context)).toEqual({
      ok: false,
      reason: 'invalid-token',
    })
    expect(await auditEvents()).toContain('refresh.reuse_detected')
  })

  it('leaves other devices alone when one family is revoked', async () => {
    const account = await seedAccount(db)
    const phone = await login(db, { username: 'muffy', password: account.password }, context)
    const desktop = await login(db, { username: 'muffy', password: account.password }, context)
    if (!phone.ok || !desktop.ok) throw new Error('login failed')

    await refreshSession(db, phone.session.refreshToken, context)
    await refreshSession(db, phone.session.refreshToken, context) // reuse on the phone

    expect((await refreshSession(db, desktop.session.refreshToken, context)).ok).toBe(true)
  })

  it('hands out only one session when the same token is refreshed twice at once', async () => {
    const { session } = await loggedIn()
    const results = await Promise.all([
      refreshSession(db, session.refreshToken, context),
      refreshSession(db, session.refreshToken, context),
    ])
    expect(results.filter((result) => result.ok)).toHaveLength(1)
  })

  it('rejects an expired token', async () => {
    const { session } = await loggedIn()
    await db
      .update(refreshTokens)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(refreshTokens.tokenHash, hashRefreshToken(session.refreshToken)))
    expect(await refreshSession(db, session.refreshToken, context)).toEqual({
      ok: false,
      reason: 'expired',
    })
  })

  it('stops a suspended account at the next refresh', async () => {
    const { session } = await loggedIn()
    await setUserStatus(db, 'muffy', 'suspended')
    expect(await refreshSession(db, session.refreshToken, context)).toEqual({
      ok: false,
      reason: 'suspended',
    })
  })

  it('rejects tokens it never issued, and junk', async () => {
    await loggedIn()
    for (const token of ['made-up', '', null, 42, undefined]) {
      expect(await refreshSession(db, token, context)).toEqual({
        ok: false,
        reason: 'invalid-token',
      })
    }
  })
})

describe('logging out', () => {
  it('ends the session, including tokens rotated from it', async () => {
    const { session } = await loggedIn()
    const rotated = await refreshSession(db, session.refreshToken, context)
    if (!rotated.ok) throw new Error('rotation failed')

    await logout(db, rotated.session.refreshToken)

    expect(await refreshSession(db, rotated.session.refreshToken, context)).toEqual({
      ok: false,
      reason: 'invalid-token',
    })
    const events = await auditEvents()
    expect(events).toContain('logout')
    // A logged-out token coming back is not theft, and must not be logged as it.
    expect(events).not.toContain('refresh.reuse_detected')
  })

  it('is silent about tokens that do not exist', async () => {
    await expect(logout(db, 'made-up')).resolves.toBeUndefined()
    await expect(logout(db, null)).resolves.toBeUndefined()
  })
})
