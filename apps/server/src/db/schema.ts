/**
 * Database schema.
 *
 * Two decisions worth explaining up front.
 *
 * **Normalised columns instead of `citext`.** Usernames and emails must be
 * unique case-insensitively, so `Muffy` and `muffy` cannot both exist. Rather
 * than depend on the `citext` extension being installed, each is stored twice:
 * the form the player typed (shown back to them) and a folded form carrying the
 * unique index. That works on any Postgres, and on the embedded one the tests
 * use.
 *
 * **Invite codes are hashed.** A leaked database should not hand someone a
 * working set of registration codes, so only a hash is stored — the same
 * reasoning as passwords, at lower stakes.
 */

import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

/**
 * Account lifecycle.
 *
 * `pending` exists for the email-verification mode that is not currently
 * enabled; invite-gated registration creates accounts `active` directly.
 */
export const USER_STATUSES = ['pending', 'active', 'suspended', 'deleted'] as const
export type UserStatus = (typeof USER_STATUSES)[number]

export const USER_ROLES = ['player', 'admin'] as const
export type UserRole = (typeof USER_ROLES)[number]

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** As typed, for display. */
    username: text('username').notNull(),
    /** Lowercased; carries the uniqueness guarantee. */
    usernameNormalised: text('username_normalised').notNull(),
    email: text('email').notNull(),
    emailNormalised: text('email_normalised').notNull(),
    status: text('status').notNull().default('active'),
    role: text('role').notNull().default('player'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('users_username_normalised_key').on(table.usernameNormalised),
    uniqueIndex('users_email_normalised_key').on(table.emailNormalised),
  ],
)

/**
 * Credentials, kept in their own table.
 *
 * Every query that reads a user for display — a lobby list, a room roster —
 * would otherwise carry the password hash along with it. Separating them means
 * the hash is only ever loaded when authentication actually needs it.
 */
export const userCredentials = pgTable('user_credentials', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  /** Full argon2id encoded string: algorithm, parameters, salt and hash. */
  passwordHash: text('password_hash').notNull(),
  passwordUpdatedAt: timestamp('password_updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export const inviteCodes = pgTable(
  'invite_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Only the hash — a leaked database must not yield usable codes. */
    codeHash: text('code_hash').notNull(),
    /** Shown in the admin list so a code can be identified without revealing it. */
    label: text('label'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    maxUses: integer('max_uses').notNull().default(1),
    usedCount: integer('used_count').notNull().default(0),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('invite_codes_hash_key').on(table.codeHash)],
)

/** Who used which code. Kept for the audit trail, not for the count. */
export const inviteRedemptions = pgTable(
  'invite_redemptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    inviteCodeId: uuid('invite_code_id')
      .notNull()
      .references(() => inviteCodes.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    redeemedAt: timestamp('redeemed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('invite_redemptions_code_idx').on(table.inviteCodeId)],
)

/**
 * Security-relevant events.
 *
 * Registrations, failed invite attempts and rate-limit trips. When something
 * looks wrong on a server nobody is watching full-time, this is the only record
 * of what happened.
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    event: text('event').notNull(),
    detail: text('detail'),
    ip: text('ip'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('audit_log_created_idx').on(table.createdAt)],
)

/**
 * DDL for the embedded Postgres used in tests, and the starting point for the
 * real migration. Kept beside the schema so the two cannot drift apart
 * unnoticed.
 *
 * A plain string rather than a drizzle `sql` template: this is several
 * statements, and Postgres's extended query protocol — which any parameterised
 * driver call uses — accepts exactly one. It has to be run as a script.
 */
export const CREATE_TABLES = `
  CREATE TABLE IF NOT EXISTS users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    username text NOT NULL,
    username_normalised text NOT NULL,
    email text NOT NULL,
    email_normalised text NOT NULL,
    status text NOT NULL DEFAULT 'active',
    role text NOT NULL DEFAULT 'player',
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE UNIQUE INDEX IF NOT EXISTS users_username_normalised_key ON users (username_normalised);
  CREATE UNIQUE INDEX IF NOT EXISTS users_email_normalised_key ON users (email_normalised);

  CREATE TABLE IF NOT EXISTS user_credentials (
    user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    password_hash text NOT NULL,
    password_updated_at timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS invite_codes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code_hash text NOT NULL,
    label text,
    created_by uuid REFERENCES users(id) ON DELETE SET NULL,
    max_uses integer NOT NULL DEFAULT 1,
    used_count integer NOT NULL DEFAULT 0,
    expires_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE UNIQUE INDEX IF NOT EXISTS invite_codes_hash_key ON invite_codes (code_hash);

  CREATE TABLE IF NOT EXISTS invite_redemptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    invite_code_id uuid NOT NULL REFERENCES invite_codes(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    redeemed_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS invite_redemptions_code_idx ON invite_redemptions (invite_code_id);

  CREATE TABLE IF NOT EXISTS audit_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    event text NOT NULL,
    detail text,
    ip text,
    user_agent text,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS audit_log_created_idx ON audit_log (created_at);
`
