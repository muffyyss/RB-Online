/**
 * Administrative operations.
 *
 * Kept apart from the CLI that calls them so they can be tested directly, and
 * so a future admin page would not have to reimplement any of it.
 *
 * These solve a real bootstrapping problem: registration needs an invite code,
 * and issuing a code needs someone to issue it. Without a way in from outside
 * the application, the very first account could never be created.
 */

import { desc, eq, sql } from 'drizzle-orm'

import { generateInviteCode, hashInviteCode } from '../auth/invite.js'
import type { Database } from '../auth/register.js'
import { auditLog, inviteCodes, users } from '../db/schema.js'
import type { UserRole, UserStatus } from '../db/schema.js'

export interface CreatedInvite {
  readonly id: string
  /**
   * The code in plaintext.
   *
   * Returned exactly once, at creation, and never stored — only its hash is.
   * If it is lost, the code is gone and a new one must be issued.
   */
  readonly code: string
  readonly maxUses: number
  readonly expiresAt: Date | null
}

export interface CreateInviteOptions {
  readonly maxUses?: number
  /** Days until expiry. Omitted means it never expires. */
  readonly expiresInDays?: number
  /** A note so the code can be recognised in a list without revealing it. */
  readonly label?: string
  readonly createdBy?: string
}

export async function createInvite(
  db: Database,
  options: CreateInviteOptions = {},
): Promise<CreatedInvite> {
  const code = generateInviteCode()
  const expiresAt =
    options.expiresInDays === undefined
      ? null
      : new Date(Date.now() + options.expiresInDays * 24 * 60 * 60 * 1000)

  const [row] = await db
    .insert(inviteCodes)
    .values({
      codeHash: hashInviteCode(code),
      maxUses: options.maxUses ?? 1,
      expiresAt,
      label: options.label ?? null,
      createdBy: options.createdBy ?? null,
    })
    .returning({ id: inviteCodes.id })

  if (!row) throw new Error('failed to create invite code')

  await db.insert(auditLog).values({
    event: 'admin.invite_created',
    detail: options.label ?? null,
    userId: options.createdBy ?? null,
  })

  return { id: row.id, code, maxUses: options.maxUses ?? 1, expiresAt }
}

export interface InviteSummary {
  readonly id: string
  readonly label: string | null
  readonly usedCount: number
  readonly maxUses: number
  readonly expiresAt: Date | null
  readonly createdAt: Date
}

/**
 * List issued codes.
 *
 * Deliberately cannot show the codes themselves — only hashes are stored, so
 * there is nothing to show. A lost code is reissued, not recovered.
 */
export async function listInvites(db: Database): Promise<readonly InviteSummary[]> {
  return db
    .select({
      id: inviteCodes.id,
      label: inviteCodes.label,
      usedCount: inviteCodes.usedCount,
      maxUses: inviteCodes.maxUses,
      expiresAt: inviteCodes.expiresAt,
      createdAt: inviteCodes.createdAt,
    })
    .from(inviteCodes)
    .orderBy(desc(inviteCodes.createdAt))
}

/** Make a code unusable without deleting the record of who used it. */
export async function revokeInvite(db: Database, id: string): Promise<boolean> {
  const revoked = await db
    .update(inviteCodes)
    .set({ maxUses: sql`${inviteCodes.usedCount}` })
    .where(eq(inviteCodes.id, id))
    .returning({ id: inviteCodes.id })

  if (revoked.length > 0) {
    await db.insert(auditLog).values({ event: 'admin.invite_revoked', detail: id })
  }
  return revoked.length > 0
}

export interface UserSummary {
  readonly id: string
  readonly username: string
  readonly email: string
  readonly status: string
  readonly role: string
  readonly createdAt: Date
}

export async function listUsers(db: Database): Promise<readonly UserSummary[]> {
  return db
    .select({
      id: users.id,
      username: users.username,
      email: users.email,
      status: users.status,
      role: users.role,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(desc(users.createdAt))
}

/**
 * Change an account's status.
 *
 * Looked up by the normalised username, so the exact casing does not have to be
 * remembered to suspend someone.
 */
export async function setUserStatus(
  db: Database,
  username: string,
  status: UserStatus,
): Promise<boolean> {
  const changed = await db
    .update(users)
    .set({ status })
    .where(eq(users.usernameNormalised, username.trim().toLowerCase()))
    .returning({ id: users.id })

  if (changed.length > 0) {
    await db.insert(auditLog).values({
      event: 'admin.status_changed',
      detail: `${username} -> ${status}`,
      userId: changed[0]?.id ?? null,
    })
  }
  return changed.length > 0
}

export async function setUserRole(
  db: Database,
  username: string,
  role: UserRole,
): Promise<boolean> {
  const changed = await db
    .update(users)
    .set({ role })
    .where(eq(users.usernameNormalised, username.trim().toLowerCase()))
    .returning({ id: users.id })

  if (changed.length > 0) {
    await db.insert(auditLog).values({
      event: 'admin.role_changed',
      detail: `${username} -> ${role}`,
      userId: changed[0]?.id ?? null,
    })
  }
  return changed.length > 0
}
