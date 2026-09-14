/**
 * Guest identities.
 *
 * A guest has a row but no credentials, email or invite: just a sequential
 * number for the `Guest000001` name, and the hash of a secret their client
 * generated and keeps. The number has to come from here — two machines
 * counting for themselves would both be Guest000001.
 *
 * When a guest registers, the row is kept and pointed at the new account
 * rather than deleted, so anything recorded against the guest (match history,
 * once it exists) can follow them.
 */

import { integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

import { users } from './schema.js'

export const guests = pgTable(
  'guests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Allocated by Postgres, so concurrent guests can never share one. */
    number: integer('number').notNull().generatedAlwaysAsIdentity(),
    /** SHA-256 of the client's secret. The secret itself is never stored. */
    secretHash: text('secret_hash').notNull(),
    /** Set when this guest registered; the guest identity then stops working. */
    adoptedByUserId: uuid('adopted_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    adoptedAt: timestamp('adopted_at', { withTimezone: true }),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('guests_number_key').on(table.number),
    uniqueIndex('guests_secret_hash_key').on(table.secretHash),
  ],
)
