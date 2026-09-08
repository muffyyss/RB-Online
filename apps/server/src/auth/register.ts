/**
 * Registration.
 *
 * Validates with the same rules the client uses (`checkRegistration`), then
 * does the two things only the server can: check the invite code, and check
 * that the username and email are not already taken.
 *
 * **On reporting duplicates plainly.** A registration form can leak whether an
 * email has an account, and the usual defence is to answer identically either
 * way. That defence is not worth its cost here: registration is invite-gated,
 * so an attacker needs a code before they can probe at all, and with no email
 * being sent there would be no way to tell a legitimate returning player why
 * nothing happened. On a friends-and-community server, telling someone "that
 * email is already registered" is the right trade. It is a decision, not an
 * oversight — flip `revealDuplicates` if the server ever opens up.
 */

import { and, eq, sql } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { checkRegistration, normaliseEmail, normaliseUsername } from '@rb/protocol'
import type { RegisterFieldError } from '@rb/protocol'

import { auditLog, inviteCodes, inviteRedemptions, userCredentials, users } from '../db/schema.js'
import { hashInviteCode } from './invite.js'
import { fakeVerify, hashPassword } from './password.js'

/** Any drizzle Postgres database — the real one, or the embedded test one. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Database = PgDatabase<any, any, any>

export interface RegisterContext {
  readonly ip?: string
  readonly userAgent?: string
  /**
   * Report "already taken" for a username or email.
   *
   * True on a private, invite-gated server, where clarity beats enumeration
   * resistance. Set false if registration is ever opened to the public.
   */
  readonly revealDuplicates?: boolean
}

export interface RegisteredUser {
  readonly id: string
  readonly username: string
  readonly email: string
}

export type RegisterResult =
  | { readonly ok: true; readonly user: RegisteredUser }
  | { readonly ok: false; readonly errors: readonly RegisterFieldError[] }

const failure = (field: RegisterFieldError['field'], message: string): RegisterResult => ({
  ok: false,
  errors: [{ field, message }],
})

async function record(
  db: Database,
  event: string,
  context: RegisterContext,
  detail?: string,
  userId?: string,
): Promise<void> {
  await db.insert(auditLog).values({
    event,
    detail: detail ?? null,
    ip: context.ip ?? null,
    userAgent: context.userAgent ?? null,
    userId: userId ?? null,
  })
}

/**
 * Create an account.
 *
 * The whole write is one transaction: a user without credentials, or an invite
 * whose count moved without an account being created, would both be worse than
 * a failed registration.
 */
export async function registerUser(
  db: Database,
  input: unknown,
  context: RegisterContext = {},
): Promise<RegisterResult> {
  // 1. Everything checkable without the database — the same rules the client ran.
  const fieldErrors = checkRegistration(input)
  if (fieldErrors.length > 0) {
    // Spend the hashing time anyway. A request rejected on validation should
    // not be visibly faster than one rejected on a duplicate.
    await fakeVerify()
    return { ok: false, errors: fieldErrors }
  }

  const request = input as {
    username: string
    email: string
    password: string
    inviteCode: string
  }
  const usernameNormalised = normaliseUsername(request.username)
  const emailNormalised = normaliseEmail(request.email)
  const reveal = context.revealDuplicates ?? true

  // 2. The invite code. Checked first: without one, nothing else matters, and
  // an invalid code should not reveal whether a username was also taken.
  const codeHash = hashInviteCode(request.inviteCode)
  const [invite] = await db.select().from(inviteCodes).where(eq(inviteCodes.codeHash, codeHash))

  if (!invite) {
    await fakeVerify()
    await record(db, 'register.invite_invalid', context)
    return failure('inviteCode', 'That invite code is not valid.')
  }
  if (invite.expiresAt && invite.expiresAt.getTime() <= Date.now()) {
    await fakeVerify()
    await record(db, 'register.invite_expired', context, invite.id)
    return failure('inviteCode', 'That invite code has expired.')
  }
  if (invite.usedCount >= invite.maxUses) {
    await fakeVerify()
    await record(db, 'register.invite_exhausted', context, invite.id)
    return failure('inviteCode', 'That invite code has already been used.')
  }

  // 3. Uniqueness, case-insensitively.
  const [takenUsername] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.usernameNormalised, usernameNormalised))
  if (takenUsername) {
    await fakeVerify()
    return failure('username', 'That username is already taken.')
  }

  const [takenEmail] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.emailNormalised, emailNormalised))
  if (takenEmail) {
    await fakeVerify()
    await record(db, 'register.duplicate_email', context)
    return reveal
      ? failure('email', 'That email address already has an account.')
      : failure('form', 'Registration could not be completed.')
  }

  // 4. Hash, then write everything at once.
  const passwordHash = await hashPassword(request.password)

  try {
    return await db.transaction(async (tx: Database) => {
      const [created] = await tx
        .insert(users)
        .values({
          username: request.username.trim(),
          usernameNormalised,
          email: request.email.trim(),
          emailNormalised,
          // Invite-gated registration needs no email verification step.
          status: 'active',
          role: 'player',
        })
        .returning({ id: users.id, username: users.username, email: users.email })

      if (!created) throw new Error('user insert returned nothing')

      await tx.insert(userCredentials).values({ userId: created.id, passwordHash })

      // Guarded increment: `used_count < max_uses` in the WHERE clause means two
      // simultaneous registrations cannot both take the last use of a code.
      const claimed = await tx
        .update(inviteCodes)
        .set({ usedCount: sql`${inviteCodes.usedCount} + 1` })
        .where(
          and(
            eq(inviteCodes.id, invite.id),
            sql`${inviteCodes.usedCount} < ${inviteCodes.maxUses}`,
          ),
        )
        .returning({ id: inviteCodes.id })

      if (claimed.length === 0) {
        throw new Error('invite code was exhausted concurrently')
      }

      await tx.insert(inviteRedemptions).values({ inviteCodeId: invite.id, userId: created.id })

      await tx.insert(auditLog).values({
        userId: created.id,
        event: 'register.success',
        ip: context.ip ?? null,
        userAgent: context.userAgent ?? null,
        detail: null,
      })

      return { ok: true as const, user: created }
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('exhausted concurrently')) {
      return failure('inviteCode', 'That invite code has already been used.')
    }
    // A unique-index violation means someone registered the same name between
    // our check and our insert. The index is the real guarantee; the earlier
    // check only exists to give a nicer message.
    if (message.includes('users_username_normalised_key')) {
      return failure('username', 'That username is already taken.')
    }
    if (message.includes('users_email_normalised_key')) {
      return reveal
        ? failure('email', 'That email address already has an account.')
        : failure('form', 'Registration could not be completed.')
    }
    throw error
  }
}
