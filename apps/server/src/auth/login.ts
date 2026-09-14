/**
 * Logging in, refreshing and logging out.
 *
 * The rule running through all of it: **a failed login says nothing about why**.
 * "No such account" and "wrong password" both answer `invalid-credentials`, and
 * both spend the same time doing it, because a fast rejection for an unknown
 * username is itself an answer. Registration can afford to be chatty about
 * duplicates — it is gated behind an invite code — but login is reachable by
 * anyone who knows the address.
 */

import { and, eq, isNull } from 'drizzle-orm'

import { normaliseUsername } from '@rb/protocol'

import { auditLog, userCredentials, users } from '../db/schema.js'
import { refreshTokens } from '../db/sessions.js'
import { fakeVerify, verifyPassword } from './password.js'
import type { Database } from './register.js'
import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
  deviceLabel,
  generateRefreshToken,
  hashRefreshToken,
  issueAccessToken,
} from './tokens.js'

export interface LoginContext {
  readonly ip?: string
  readonly userAgent?: string
  readonly jwtSecret: string
}

export interface Session {
  readonly accessToken: string
  /** Seconds until the access token expires, for the client's refresh timer. */
  readonly expiresIn: number
  readonly refreshToken: string
  readonly user: { readonly id: string; readonly username: string; readonly role: string }
}

export type LoginFailure =
  /** Wrong username or wrong password — deliberately not distinguished. */
  'invalid-credentials' | 'suspended'

export type LoginResult =
  | { readonly ok: true; readonly session: Session }
  | { readonly ok: false; readonly reason: LoginFailure }

async function record(
  db: Database,
  event: string,
  context: { ip?: string; userAgent?: string },
  userId?: string,
  detail?: string,
): Promise<void> {
  await db.insert(auditLog).values({
    event,
    userId: userId ?? null,
    ip: context.ip ?? null,
    userAgent: context.userAgent ?? null,
    detail: detail ?? null,
  })
}

async function issueSession(
  db: Database,
  user: { id: string; username: string; role: string },
  context: LoginContext,
  familyId?: string,
): Promise<Session> {
  const refreshToken = generateRefreshToken()
  const [row] = await db
    .insert(refreshTokens)
    .values({
      userId: user.id,
      tokenHash: hashRefreshToken(refreshToken),
      // A fresh login starts a new family; a refresh stays in its own.
      familyId: familyId ?? crypto.randomUUID(),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
      deviceLabel: deviceLabel(context.userAgent),
    })
    .returning({ id: refreshTokens.id })
  if (!row) throw new Error('failed to store refresh token')

  return {
    accessToken: issueAccessToken(
      { sub: user.id, username: user.username, role: user.role },
      context.jwtSecret,
    ),
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    refreshToken,
    user,
  }
}

/**
 * Log in with a username and password.
 *
 * The username may be given in any casing; it is matched on the normalised
 * form, the same one the unique index uses.
 */
export async function login(
  db: Database,
  input: unknown,
  context: LoginContext,
): Promise<LoginResult> {
  const credentials = input as { username?: unknown; password?: unknown } | null
  if (
    !credentials ||
    typeof credentials.username !== 'string' ||
    typeof credentials.password !== 'string'
  ) {
    await fakeVerify()
    return { ok: false, reason: 'invalid-credentials' }
  }

  const [account] = await db
    .select({
      id: users.id,
      username: users.username,
      role: users.role,
      status: users.status,
      passwordHash: userCredentials.passwordHash,
    })
    .from(users)
    .innerJoin(userCredentials, eq(userCredentials.userId, users.id))
    .where(eq(users.usernameNormalised, normaliseUsername(credentials.username)))

  if (!account) {
    // Spend the same effort as a real verification. Without this, an unknown
    // username would answer noticeably faster than a wrong password, which
    // turns the endpoint into a username oracle.
    await fakeVerify()
    await record(db, 'login.unknown_user', context)
    return { ok: false, reason: 'invalid-credentials' }
  }

  const correct = await verifyPassword(account.passwordHash, credentials.password)
  if (!correct) {
    await record(db, 'login.wrong_password', context, account.id)
    return { ok: false, reason: 'invalid-credentials' }
  }

  // Status is checked *after* the password, so a wrong password cannot reveal
  // that an account exists and is suspended.
  if (account.status !== 'active') {
    await record(db, 'login.suspended', context, account.id)
    return { ok: false, reason: 'suspended' }
  }

  await record(db, 'login.success', context, account.id)
  return {
    ok: true,
    session: await issueSession(
      db,
      { id: account.id, username: account.username, role: account.role },
      context,
    ),
  }
}

export type RefreshFailure = 'invalid-token' | 'expired' | 'reused' | 'suspended'

export type RefreshResult =
  | { readonly ok: true; readonly session: Session }
  | { readonly ok: false; readonly reason: RefreshFailure }

/**
 * Exchange a refresh token for a new pair, rotating it.
 *
 * The old token is revoked as part of the same transaction that issues the new
 * one, so there is never a moment when both work.
 *
 * Presenting a token that has *already* been rotated is the interesting case:
 * it means two parties hold tokens from one login. We cannot tell which is the
 * thief, so the entire family is revoked and both must log in again. A real
 * player is mildly inconvenienced; an attacker loses the session.
 */
export async function refreshSession(
  db: Database,
  token: unknown,
  context: LoginContext,
): Promise<RefreshResult> {
  if (typeof token !== 'string' || token.length === 0) {
    return { ok: false, reason: 'invalid-token' }
  }

  const hash = hashRefreshToken(token)
  const [stored] = await db.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, hash))

  if (!stored) return { ok: false, reason: 'invalid-token' }

  if (stored.revokedAt) {
    // A token ended by logout or an earlier revocation is simply dead. Only a
    // token that was *rotated* signals theft: its successor is out there.
    if (stored.revokedReason !== 'rotated') return { ok: false, reason: 'invalid-token' }

    // Reuse detected. Revoke everything descended from this login.
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date(), revokedReason: 'family-reuse' })
      .where(and(eq(refreshTokens.familyId, stored.familyId), isNull(refreshTokens.revokedAt)))
    await record(db, 'refresh.reuse_detected', context, stored.userId, stored.familyId)
    return { ok: false, reason: 'reused' }
  }

  if (stored.expiresAt.getTime() <= Date.now()) {
    return { ok: false, reason: 'expired' }
  }

  const [account] = await db
    .select({
      id: users.id,
      username: users.username,
      role: users.role,
      status: users.status,
    })
    .from(users)
    .where(eq(users.id, stored.userId))

  if (!account) return { ok: false, reason: 'invalid-token' }
  // A suspension takes effect at the next refresh, which is the point of
  // keeping access tokens short.
  if (account.status !== 'active') {
    await record(db, 'refresh.suspended', context, account.id)
    return { ok: false, reason: 'suspended' }
  }

  const session = await db.transaction(async (tx: Database) => {
    // The revoke is conditional on the token still being live. Two refreshes
    // racing with the same token both pass the check above; only one of them
    // wins this update, and the loser must not be handed a second session.
    const revoked = await tx
      .update(refreshTokens)
      .set({ revokedAt: new Date(), revokedReason: 'rotated' })
      .where(and(eq(refreshTokens.id, stored.id), isNull(refreshTokens.revokedAt)))
      .returning({ id: refreshTokens.id })
    if (revoked.length === 0) return null
    return issueSession(
      tx,
      { id: account.id, username: account.username, role: account.role },
      context,
      stored.familyId,
    )
  })

  if (!session) return { ok: false, reason: 'invalid-token' }
  return { ok: true, session }
}

/**
 * Log out.
 *
 * Revokes the whole family rather than the one token, so logging out on a
 * device really ends that session instead of leaving an earlier token alive.
 * Always reports success: whether the token existed is not the caller's
 * business, and a logout that "fails" is a confusing thing to show anyone.
 */
export async function logout(db: Database, token: unknown): Promise<void> {
  if (typeof token !== 'string' || token.length === 0) return

  const [stored] = await db
    .select({ familyId: refreshTokens.familyId, userId: refreshTokens.userId })
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, hashRefreshToken(token)))

  if (!stored) return

  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date(), revokedReason: 'logout' })
    .where(and(eq(refreshTokens.familyId, stored.familyId), isNull(refreshTokens.revokedAt)))

  await db.insert(auditLog).values({ event: 'logout', userId: stored.userId })
}
