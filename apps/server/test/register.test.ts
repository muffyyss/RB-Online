import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'

import { registerUser } from '../src/auth/register.js'
import type { Database } from '../src/auth/register.js'
import { verifyPassword } from '../src/auth/password.js'
import {
  auditLog,
  inviteCodes,
  inviteRedemptions,
  userCredentials,
  users,
} from '../src/db/schema.js'
import { createTestDb, seedInvite, validRegistration } from './support/db.js'
import type { TestDb } from './support/db.js'

let harness: TestDb
let db: Database

beforeEach(async () => {
  harness = await createTestDb()
  db = harness.db
})

afterEach(async () => {
  // Guarded: if setup failed, the real error should surface rather than a
  // null dereference in teardown.
  await harness?.close()
})

/** Register with a freshly seeded invite code. */
async function register(overrides: Record<string, unknown> = {}, maxUses = 1) {
  const invite = await seedInvite(db, { maxUses })
  return {
    invite,
    result: await registerUser(db, validRegistration({ inviteCode: invite.code, ...overrides })),
  }
}

const fieldsOf = (result: Awaited<ReturnType<typeof registerUser>>) =>
  result.ok ? [] : result.errors.map((e) => e.field)

describe('a successful registration', () => {
  it('creates the account', async () => {
    const { result } = await register()
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.user.username).toBe('muffy')
    expect(result.user.email).toBe('muffy@example.com')
  })

  it('stores an argon2id hash, never the password', async () => {
    const { result } = await register()
    if (!result.ok) throw new Error('registration failed')

    const [row] = await db
      .select()
      .from(userCredentials)
      .where(eq(userCredentials.userId, result.user.id))
    expect(row?.passwordHash).toMatch(/^\$argon2id\$/)
    expect(row?.passwordHash).not.toContain('correct1horse')
    expect(await verifyPassword(row?.passwordHash ?? '', 'correct1horse')).toBe(true)
    expect(await verifyPassword(row?.passwordHash ?? '', 'wrongpassword1')).toBe(false)
  })

  it('keeps the typed form for display and a folded form for uniqueness', async () => {
    const { result } = await register({ username: 'MuFFy', email: 'MuFFy@Example.COM' })
    if (!result.ok) throw new Error('registration failed')

    const [row] = await db.select().from(users).where(eq(users.id, result.user.id))
    expect(row?.username).toBe('MuFFy')
    expect(row?.usernameNormalised).toBe('muffy')
    expect(row?.emailNormalised).toBe('muffy@example.com')
  })

  it('creates the account active — invite gating replaces email verification', async () => {
    const { result } = await register()
    if (!result.ok) throw new Error('registration failed')
    const [row] = await db.select().from(users).where(eq(users.id, result.user.id))
    expect(row?.status).toBe('active')
    expect(row?.role).toBe('player')
  })

  it('records the redemption and the audit entry', async () => {
    const { invite, result } = await register()
    if (!result.ok) throw new Error('registration failed')

    const redemptions = await db
      .select()
      .from(inviteRedemptions)
      .where(eq(inviteRedemptions.inviteCodeId, invite.id))
    expect(redemptions).toHaveLength(1)

    const events = await db.select().from(auditLog)
    expect(events.map((e) => e.event)).toContain('register.success')
  })
})

describe('duplicate accounts (case-insensitive)', () => {
  it('refuses a username differing only in case', async () => {
    const first = await register()
    expect(first.result.ok).toBe(true)

    const invite = await seedInvite(db)
    const second = await registerUser(
      db,
      validRegistration({
        username: 'MUFFY',
        email: 'other@example.com',
        inviteCode: invite.code,
      }),
    )
    expect(fieldsOf(second)).toEqual(['username'])
  })

  it('refuses an email differing only in case', async () => {
    await register()
    const invite = await seedInvite(db)
    const second = await registerUser(
      db,
      validRegistration({
        username: 'someoneelse',
        email: 'MUFFY@EXAMPLE.COM',
        inviteCode: invite.code,
      }),
    )
    expect(fieldsOf(second)).toEqual(['email'])
  })

  it('leaves exactly one account behind after a rejected duplicate', async () => {
    await register()
    const invite = await seedInvite(db)
    await registerUser(
      db,
      validRegistration({ username: 'MUFFY', email: 'x@example.com', inviteCode: invite.code }),
    )
    expect(await db.select().from(users)).toHaveLength(1)
  })

  it('does not consume the invite code when registration is refused', async () => {
    await register()
    const invite = await seedInvite(db)
    await registerUser(
      db,
      validRegistration({ username: 'MUFFY', email: 'x@example.com', inviteCode: invite.code }),
    )
    const [row] = await db.select().from(inviteCodes).where(eq(inviteCodes.id, invite.id))
    expect(row?.usedCount).toBe(0)
  })
})

describe('invite codes', () => {
  it('refuses an unknown code', async () => {
    const result = await registerUser(db, validRegistration({ inviteCode: 'NOSUCHCODE' }))
    expect(fieldsOf(result)).toEqual(['inviteCode'])
    expect(await db.select().from(users)).toHaveLength(0)
  })

  it('accepts a code however it was typed or spaced', async () => {
    // Codes get read aloud and retyped, so case, spaces and hyphens are folded.
    await seedInvite(db, { code: 'ABCD234XYZ' })
    const result = await registerUser(db, validRegistration({ inviteCode: '  abcd-234 xyz ' }))
    expect(result.ok).toBe(true)
  })

  it('consumes a single-use code', async () => {
    const { invite, result } = await register()
    if (!result.ok) throw new Error('registration failed')
    const [row] = await db.select().from(inviteCodes).where(eq(inviteCodes.id, invite.id))
    expect(row?.usedCount).toBe(1)

    const second = await registerUser(
      db,
      validRegistration({
        username: 'another',
        email: 'another@example.com',
        inviteCode: invite.code,
      }),
    )
    expect(fieldsOf(second)).toEqual(['inviteCode'])
  })

  it('allows a multi-use code up to its limit', async () => {
    const invite = await seedInvite(db, { maxUses: 2 })
    for (const n of [1, 2]) {
      const result = await registerUser(
        db,
        validRegistration({
          username: `player${String(n)}`,
          email: `p${String(n)}@example.com`,
          inviteCode: invite.code,
        }),
      )
      expect(result.ok).toBe(true)
    }
    const third = await registerUser(
      db,
      validRegistration({
        username: 'player3',
        email: 'p3@example.com',
        inviteCode: invite.code,
      }),
    )
    expect(fieldsOf(third)).toEqual(['inviteCode'])
  })

  it('refuses an expired code', async () => {
    const invite = await seedInvite(db, { expiresAt: new Date(Date.now() - 1000) })
    const result = await registerUser(db, validRegistration({ inviteCode: invite.code }))
    expect(fieldsOf(result)).toEqual(['inviteCode'])
  })

  it('stores only a hash — a leaked table yields no usable codes', async () => {
    const invite = await seedInvite(db)
    const [row] = await db.select().from(inviteCodes).where(eq(inviteCodes.id, invite.id))
    expect(row?.codeHash).not.toBe(invite.code)
    expect(row?.codeHash).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('validation is the same as the client sees', () => {
  it('applies the password rules', async () => {
    const invite = await seedInvite(db)
    for (const password of ['short1', 'has space1', 'symbols!1', 'a'.repeat(17)]) {
      const result = await registerUser(
        db,
        validRegistration({ password, inviteCode: invite.code }),
      )
      expect(fieldsOf(result)).toContain('password')
    }
    expect(await db.select().from(users)).toHaveLength(0)
  })

  it('rejects junk payloads without creating anything', async () => {
    for (const junk of [null, undefined, 42, 'text', {}]) {
      const result = await registerUser(db, junk)
      expect(result.ok).toBe(false)
      expect(fieldsOf(result).length).toBeGreaterThan(0)
    }
    expect(await db.select().from(users)).toHaveLength(0)
  })

  it('checks the invite code before revealing anything about the username', async () => {
    // A bad code should not also tell you whether a name is free.
    await register()
    const result = await registerUser(
      db,
      validRegistration({ username: 'muffy', inviteCode: 'WRONGCODE1' }),
    )
    expect(fieldsOf(result)).toEqual(['inviteCode'])
  })
})

describe('atomicity', () => {
  it('writes the user, the credentials, the redemption and the count together', async () => {
    const { invite, result } = await register()
    if (!result.ok) throw new Error('registration failed')

    expect(await db.select().from(users)).toHaveLength(1)
    expect(await db.select().from(userCredentials)).toHaveLength(1)
    expect(await db.select().from(inviteRedemptions)).toHaveLength(1)
    const [code] = await db.select().from(inviteCodes).where(eq(inviteCodes.id, invite.id))
    expect(code?.usedCount).toBe(1)
  })

  it('never leaves a user without credentials', async () => {
    await register()
    const accounts = await db.select().from(users)
    const credentials = await db.select().from(userCredentials)
    expect(credentials).toHaveLength(accounts.length)
  })
})
