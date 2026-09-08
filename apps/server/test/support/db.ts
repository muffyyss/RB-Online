/**
 * A real Postgres for tests, with nothing to install.
 *
 * PGlite is Postgres compiled to WASM, so these tests run the same SQL, the
 * same constraints and the same transaction semantics as the deployed server.
 * A mock repository would let a broken unique index or a missing transaction
 * pass unnoticed — which is exactly the class of bug that matters most in an
 * accounts table.
 */

import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'

import { CREATE_TABLES } from '../../src/db/schema.js'
import type { Database } from '../../src/auth/register.js'
import { generateInviteCode, hashInviteCode } from '../../src/auth/invite.js'
import { inviteCodes } from '../../src/db/schema.js'

export interface TestDb {
  readonly db: Database
  readonly close: () => Promise<void>
}

/** A fresh, empty database per test. */
export async function createTestDb(): Promise<TestDb> {
  const client = new PGlite()
  const db = drizzle(client) as unknown as Database
  // `exec` runs a multi-statement script; a parameterised query cannot.
  await client.exec(CREATE_TABLES)
  return {
    db,
    close: async () => {
      await client.close()
    },
  }
}

export interface SeededInvite {
  readonly code: string
  readonly id: string
}

/** Insert an invite code and return the plaintext, which is never stored. */
export async function seedInvite(
  db: Database,
  options: { maxUses?: number; expiresAt?: Date; code?: string } = {},
): Promise<SeededInvite> {
  const code = options.code ?? generateInviteCode()
  const [row] = await db
    .insert(inviteCodes)
    .values({
      codeHash: hashInviteCode(code),
      maxUses: options.maxUses ?? 1,
      expiresAt: options.expiresAt ?? null,
      label: 'test',
    })
    .returning({ id: inviteCodes.id })
  if (!row) throw new Error('failed to seed invite code')
  return { code, id: row.id }
}

/** A registration payload that passes every rule, for overriding one field. */
export function validRegistration(overrides: Record<string, unknown> = {}) {
  return {
    username: 'muffy',
    email: 'muffy@example.com',
    password: 'correct1horse',
    inviteCode: 'PLACEHOLDER',
    acceptedTerms: true,
    ...overrides,
  }
}
