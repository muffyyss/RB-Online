/**
 * Session storage.
 *
 * Two kinds of token, for two different jobs:
 *
 * **Access token** — a short-lived JWT the client sends with every request. It
 * is not stored: the signature proves it is ours, and it expires quickly enough
 * that revocation lists are not worth the cost.
 *
 * **Refresh token** — long-lived, opaque, and stored here as a hash. It buys a
 * new access token and is *rotated* on every use, so a stolen one is only good
 * until the real owner next refreshes.
 *
 * Rotation is what makes theft detectable. Tokens issued from the same login
 * share a `familyId`; using a token that has already been rotated means two
 * parties hold tokens from one family, so the whole family is revoked and both
 * are forced to log in again. Better a real player logs in again than an
 * attacker keeps a session alive indefinitely.
 */

import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import { users } from './schema.js'

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** SHA-256 of the token. The token itself is never stored. */
    tokenHash: text('token_hash').notNull(),
    /**
     * Every token descended from one login.
     *
     * Reusing a rotated token revokes the whole family, because two parties now
     * hold tokens from the same login and only one of them should.
     */
    familyId: uuid('family_id').notNull(),
    /** Set when rotated or revoked; a token with this set must not be accepted. */
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    /** Why it was revoked, so a forced logout can be explained. */
    revokedReason: text('revoked_reason'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    /** Rough device label from the user agent, so a session list is readable. */
    deviceLabel: text('device_label'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Refresh looks a token up by hash on every call; it must be indexed.
    index('refresh_tokens_hash_idx').on(table.tokenHash),
    index('refresh_tokens_family_idx').on(table.familyId),
    index('refresh_tokens_user_idx').on(table.userId),
  ],
)
