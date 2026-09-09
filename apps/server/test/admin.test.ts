import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'

import {
  createInvite,
  listInvites,
  listUsers,
  revokeInvite,
  setUserRole,
  setUserStatus,
} from '../src/admin/index.js'
import { hashInviteCode } from '../src/auth/invite.js'
import { registerUser } from '../src/auth/register.js'
import type { Database } from '../src/auth/register.js'
import { auditLog, inviteCodes, users } from '../src/db/schema.js'
import { createTestDb, validRegistration } from './support/db.js'
import type { TestDb } from './support/db.js'

let harness: TestDb
let db: Database

beforeEach(async () => {
  harness = await createTestDb()
  db = harness.db
})

afterEach(async () => {
  await harness?.close()
})

/** Create a code and use it, since most admin checks need an account to exist. */
async function seedAccount(username = 'muffy'): Promise<void> {
  const invite = await createInvite(db)
  const result = await registerUser(
    db,
    validRegistration({
      username,
      email: `${username}@example.com`,
      inviteCode: invite.code,
    }),
  )
  if (!result.ok) throw new Error(`could not seed ${username}`)
}

describe('creating invite codes — the way the first account exists', () => {
  it('produces a code that registration accepts', async () => {
    const invite = await createInvite(db)
    const result = await registerUser(db, validRegistration({ inviteCode: invite.code }))
    expect(result.ok).toBe(true)
  })

  it('stores only the hash, so the code cannot be recovered later', async () => {
    const invite = await createInvite(db)
    const [row] = await db.select().from(inviteCodes).where(eq(inviteCodes.id, invite.id))
    expect(row?.codeHash).toBe(hashInviteCode(invite.code))
    expect(row?.codeHash).not.toContain(invite.code)
  })

  it('never returns the code from a listing — there is nothing to return', async () => {
    const invite = await createInvite(db, { label: 'for Sam' })
    const listed = await listInvites(db)
    expect(JSON.stringify(listed)).not.toContain(invite.code)
    expect(listed[0]?.label).toBe('for Sam')
  })

  it('generates a different code every time', async () => {
    const codes = new Set<string>()
    for (let i = 0; i < 25; i += 1) codes.add((await createInvite(db)).code)
    expect(codes.size).toBe(25)
  })

  it('honours a use limit', async () => {
    const invite = await createInvite(db, { maxUses: 3 })
    const [row] = await db.select().from(inviteCodes).where(eq(inviteCodes.id, invite.id))
    expect(row?.maxUses).toBe(3)
  })

  it('sets an expiry in days, or none at all', async () => {
    const dated = await createInvite(db, { expiresInDays: 7 })
    expect(dated.expiresAt).toBeInstanceOf(Date)
    const days = ((dated.expiresAt?.getTime() ?? 0) - Date.now()) / (24 * 60 * 60 * 1000)
    expect(days).toBeGreaterThan(6.9)
    expect(days).toBeLessThan(7.1)

    expect((await createInvite(db)).expiresAt).toBeNull()
  })

  it('records the creation in the audit log', async () => {
    await createInvite(db, { label: 'for Sam' })
    const events = await db.select().from(auditLog)
    expect(events.map((e) => e.event)).toContain('admin.invite_created')
  })
})

describe('revoking a code', () => {
  it('makes it unusable', async () => {
    const invite = await createInvite(db, { maxUses: 5 })
    expect(await revokeInvite(db, invite.id)).toBe(true)

    const result = await registerUser(db, validRegistration({ inviteCode: invite.code }))
    expect(result.ok).toBe(false)
  })

  it('keeps the record rather than deleting it', async () => {
    const invite = await createInvite(db, { maxUses: 5, label: 'oops' })
    await revokeInvite(db, invite.id)
    const listed = await listInvites(db)
    expect(listed.map((i) => i.label)).toContain('oops')
  })

  it('reports when there is nothing to revoke', async () => {
    expect(await revokeInvite(db, '00000000-0000-0000-0000-000000000000')).toBe(false)
  })
})

describe('managing accounts', () => {
  it('lists them without exposing password hashes', async () => {
    await seedAccount()
    const listed = await listUsers(db)
    expect(listed).toHaveLength(1)
    expect(JSON.stringify(listed)).not.toContain('argon2')
  })

  it('suspends and reactivates by username, whatever the casing', async () => {
    await seedAccount('Muffy')

    expect(await setUserStatus(db, 'MUFFY', 'suspended')).toBe(true)
    let [row] = await db.select().from(users)
    expect(row?.status).toBe('suspended')

    expect(await setUserStatus(db, '  muffy ', 'active')).toBe(true)
    ;[row] = await db.select().from(users)
    expect(row?.status).toBe('active')
  })

  it('promotes and demotes', async () => {
    await seedAccount()
    expect(await setUserRole(db, 'muffy', 'admin')).toBe(true)
    let [row] = await db.select().from(users)
    expect(row?.role).toBe('admin')

    await setUserRole(db, 'muffy', 'player')
    ;[row] = await db.select().from(users)
    expect(row?.role).toBe('player')
  })

  it('reports when no such account exists rather than failing silently', async () => {
    expect(await setUserStatus(db, 'nobody', 'suspended')).toBe(false)
    expect(await setUserRole(db, 'nobody', 'admin')).toBe(false)
  })

  it('writes an audit entry for every change', async () => {
    await seedAccount()
    await setUserStatus(db, 'muffy', 'suspended')
    await setUserRole(db, 'muffy', 'admin')

    const events = (await db.select().from(auditLog)).map((e) => e.event)
    expect(events).toContain('admin.status_changed')
    expect(events).toContain('admin.role_changed')
  })
})
