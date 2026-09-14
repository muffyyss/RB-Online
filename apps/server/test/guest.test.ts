import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { randomBytes } from 'node:crypto'

import { guestName, isReservedUsername } from '@rb/protocol'

import { guestLogin, hashGuestSecret } from '../src/auth/guest.js'
import { registerUser } from '../src/auth/register.js'
import type { Database } from '../src/auth/register.js'
import { verifyAccessToken } from '../src/auth/tokens.js'
import { guests } from '../src/db/guests.js'
import {
  TEST_JWT_SECRET,
  createTestDb,
  resetDb,
  seedInvite,
  validRegistration,
} from './support/db.js'
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

const context = { ip: '203.0.113.20', jwtSecret: TEST_JWT_SECRET }
const newSecret = () => randomBytes(32).toString('base64url')

async function asGuest(secret: string) {
  const result = await guestLogin(db, { guestSecret: secret }, context)
  if (!result.ok) throw new Error(`guest login failed: ${result.reason}`)
  return result.session
}

describe('guest names', () => {
  it('are Guest plus a six-digit number', () => {
    expect(guestName(1)).toBe('Guest000001')
    expect(guestName(123456)).toBe('Guest123456')
    expect(guestName(1234567)).toBe('Guest1234567')
  })

  it('cannot be taken by a registered player', () => {
    for (const name of ['Guest000001', 'guest', 'GUEST_king', 'guest-42']) {
      expect(isReservedUsername(name)).toBe(true)
    }
    expect(isReservedUsername('Aguest')).toBe(false)
  })
})

describe('becoming a guest', () => {
  it('creates a numbered guest the first time, with a guest token', async () => {
    const session = await asGuest(newSecret())
    expect(session.created).toBe(true)
    expect(session.guest.name).toBe('Guest000001')

    const verified = verifyAccessToken(session.accessToken, TEST_JWT_SECRET)
    expect(verified.ok && verified.claims).toMatchObject({
      sub: session.guest.id,
      username: 'Guest000001',
      role: 'guest',
    })
  })

  it('numbers guests in order', async () => {
    const names = []
    for (let i = 0; i < 3; i += 1) names.push((await asGuest(newSecret())).guest.name)
    expect(names).toEqual(['Guest000001', 'Guest000002', 'Guest000003'])
  })

  it('returns the same guest for the same secret, forever', async () => {
    const secret = newSecret()
    const first = await asGuest(secret)
    const again = await asGuest(secret)
    expect(again.created).toBe(false)
    expect(again.guest).toEqual(first.guest)
  })

  it('does not burn a number when a guest comes back', async () => {
    const secret = newSecret()
    await asGuest(secret)
    await asGuest(secret)
    await asGuest(secret)
    expect((await asGuest(newSecret())).guest.name).toBe('Guest000002')
  })

  it('stores only the hash of the secret', async () => {
    const secret = newSecret()
    await asGuest(secret)
    const rows = await db.select().from(guests)
    expect(rows[0]?.secretHash).toBe(hashGuestSecret(secret))
    expect(JSON.stringify(rows)).not.toContain(secret)
  })

  it('handles the same first request arriving twice at once', async () => {
    const secret = newSecret()
    const [a, b] = await Promise.all([asGuest(secret), asGuest(secret)])
    expect(a.guest.id).toBe(b.guest.id)
    expect(await db.select().from(guests)).toHaveLength(1)
  })

  it('refuses short, malformed or missing secrets', async () => {
    for (const input of [
      null,
      {},
      { guestSecret: 'short' },
      { guestSecret: 'x'.repeat(42) },
      { guestSecret: `${'a'.repeat(43)}!` },
      { guestSecret: 42 },
    ]) {
      expect(await guestLogin(db, input, context)).toEqual({ ok: false, reason: 'invalid-secret' })
    }
    expect(await db.select().from(guests)).toHaveLength(0)
  })
})

describe('registering after playing as a guest', () => {
  it('adopts the guest, which then stops working as a guest', async () => {
    const secret = newSecret()
    const guest = await asGuest(secret)
    const invite = await seedInvite(db)

    const registered = await registerUser(
      db,
      validRegistration({ inviteCode: invite.code, guestSecret: secret }),
    )
    expect(registered.ok).toBe(true)
    if (!registered.ok) return

    const [row] = await db.select().from(guests)
    expect(row?.id).toBe(guest.guest.id)
    expect(row?.adoptedByUserId).toBe(registered.user.id)
    expect(row?.adoptedAt).toBeInstanceOf(Date)

    expect(await guestLogin(db, { guestSecret: secret }, context)).toEqual({
      ok: false,
      reason: 'adopted',
    })
  })

  it('still registers when the secret matches no guest', async () => {
    const invite = await seedInvite(db)
    const registered = await registerUser(
      db,
      validRegistration({ inviteCode: invite.code, guestSecret: newSecret() }),
    )
    expect(registered.ok).toBe(true)
  })

  it('refuses a malformed guest secret as a form error', async () => {
    const invite = await seedInvite(db)
    const registered = await registerUser(
      db,
      validRegistration({ inviteCode: invite.code, guestSecret: 'nope' }),
    )
    expect(registered.ok).toBe(false)
  })
})
