/**
 * Playing as a guest.
 *
 * The client generates a secret the first time it runs and keeps it until the
 * game is uninstalled. Sending that secret here either resumes the guest it
 * belongs to or creates a new one, and either way returns an access token.
 *
 * There is no refresh token. The secret already *is* the long-lived credential,
 * so when the access token runs out the client simply asks again.
 *
 * What stops guests undoing the invite gate is not here but in the rooms: a
 * guest can join a room and never create one, so without a registered player
 * handing over a code, a guest account is good for nothing.
 */

import { and, eq, isNull } from 'drizzle-orm'
import { createHash } from 'node:crypto'

import { guestName, guestRequestSchema } from '@rb/protocol'

import { violatesUnique } from '../db/errors.js'
import { auditLog } from '../db/schema.js'
import { guests } from '../db/guests.js'
import type { Database } from './register.js'
import { ACCESS_TOKEN_TTL_SECONDS, issueAccessToken } from './tokens.js'

export interface GuestContext {
  readonly ip?: string
  readonly userAgent?: string
  readonly jwtSecret: string
}

export interface GuestSession {
  readonly accessToken: string
  readonly expiresIn: number
  readonly guest: { readonly id: string; readonly name: string }
  /** True the first time, so the client can welcome a brand-new guest. */
  readonly created: boolean
}

export type GuestFailure =
  /** The request did not carry a well-formed secret. */
  | 'invalid-secret'
  /** This guest has since registered; log in to the account instead. */
  | 'adopted'

export type GuestResult =
  | { readonly ok: true; readonly session: GuestSession }
  | { readonly ok: false; readonly reason: GuestFailure }

/** SHA-256: the secret is 256 random bits, so there is no dictionary to slow down. */
export function hashGuestSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex')
}

function sessionFor(
  row: { id: string; number: number },
  created: boolean,
  secret: string,
): GuestSession {
  const name = guestName(row.number)
  return {
    accessToken: issueAccessToken({ sub: row.id, username: name, role: 'guest' }, secret),
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    guest: { id: row.id, name },
    created,
  }
}

export async function guestLogin(
  db: Database,
  input: unknown,
  context: GuestContext,
): Promise<GuestResult> {
  const parsed = guestRequestSchema.safeParse(input)
  if (!parsed.success) return { ok: false, reason: 'invalid-secret' }
  const secretHash = hashGuestSecret(parsed.data.guestSecret)

  const [existing] = await db.select().from(guests).where(eq(guests.secretHash, secretHash))
  if (existing) {
    if (existing.adoptedByUserId) return { ok: false, reason: 'adopted' }
    await db.update(guests).set({ lastSeenAt: new Date() }).where(eq(guests.id, existing.id))
    return { ok: true, session: sessionFor(existing, false, context.jwtSecret) }
  }

  // Looked up first and inserted second, rather than an upsert: a conflicting
  // insert still consumes a number from the sequence, and a returning guest
  // would leave a gap in the names every time they came back.
  try {
    const [created] = await db
      .insert(guests)
      .values({ secretHash })
      .returning({ id: guests.id, number: guests.number })
    if (!created) throw new Error('guest insert returned nothing')

    await db.insert(auditLog).values({
      event: 'guest.created',
      detail: guestName(created.number),
      ip: context.ip ?? null,
      userAgent: context.userAgent ?? null,
    })
    return { ok: true, session: sessionFor(created, true, context.jwtSecret) }
  } catch (error) {
    // The same client sent two first requests at once and the other one won.
    // Its row is the guest; answer with that.
    if (!violatesUnique(error, 'guests_secret_hash_key')) throw error
    const [winner] = await db.select().from(guests).where(eq(guests.secretHash, secretHash))
    if (!winner) throw error
    return { ok: true, session: sessionFor(winner, false, context.jwtSecret) }
  }
}

/**
 * Point a guest at the account that replaced it.
 *
 * Called inside the registration transaction. A secret matching no guest, or
 * one already adopted, is not an error: registration does not depend on it,
 * and a stale secret on disk should not stop anyone creating an account.
 */
export async function adoptGuest(db: Database, secret: string, userId: string): Promise<boolean> {
  const adopted = await db
    .update(guests)
    .set({ adoptedByUserId: userId, adoptedAt: new Date() })
    .where(and(eq(guests.secretHash, hashGuestSecret(secret)), isNull(guests.adoptedByUserId)))
    .returning({ id: guests.id })
  return adopted.length > 0
}
