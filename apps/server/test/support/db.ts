/**
 * A real Postgres for tests, with nothing to install.
 *
 * PGlite is Postgres compiled to WASM, so these tests run the same SQL, the
 * same constraints and the same transaction semantics as the deployed server.
 * A mock repository would let a broken unique index or a missing transaction
 * pass unnoticed — which is exactly the class of bug that matters most in an
 * accounts table.
 *
 * Crucially, the tables come from the **real migration files**, the same ones
 * that will run against the production database. An earlier version had a
 * hand-written `CREATE TABLE` script here, which meant the tests could pass
 * against a schema the real server never had.
 */

import { PGlite } from '@electric-sql/pglite'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { dirname, join } from 'node:path'

import type { Database } from '../../src/auth/register.js'
import { generateInviteCode, hashInviteCode } from '../../src/auth/invite.js'
import { inviteCodes } from '../../src/db/schema.js'

/** apps/server/drizzle, resolved from this file's location. */
function migrationsFolder(): string {
  // test/support/db.ts -> apps/server/drizzle
  return join(dirname(dirname(import.meta.dirname)), 'drizzle')
}

export interface TestDb {
  readonly db: Database
  readonly close: () => Promise<void>
}

/** A fresh, empty, fully migrated database per test. */
export async function createTestDb(): Promise<TestDb> {
  const client = new PGlite()
  const db = drizzle(client)
  await migrate(db, { migrationsFolder: migrationsFolder() })
  return {
    db: db as unknown as Database,
    close: async () => {
      await client.close()
    },
  }
}

/**
 * Every table, in an order safe to truncate.
 *
 * Migrating a fresh database per test is correct but slow — PGlite has to
 * replay the whole migration each time. Migrating once per file and truncating
 * between tests gives the same isolation for a fraction of the cost.
 */
const TABLES = ['audit_log', 'invite_redemptions', 'user_credentials', 'invite_codes', 'users']

/** Empty every table, leaving the migrated schema in place. */
export async function resetDb(db: Database): Promise<void> {
  // CASCADE handles the foreign keys, so the order above is belt-and-braces.
  await db.execute(sql.raw(`TRUNCATE ${TABLES.join(', ')} CASCADE`))
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
