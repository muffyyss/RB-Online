/**
 * Invite codes.
 *
 * Registration is gated: without a code you cannot create an account. That is
 * what keeps a small private server closed without needing email verification,
 * an SMTP server, or any way to contact strangers.
 *
 * Codes are hashed with SHA-256 rather than argon2, and the difference is
 * deliberate. A password hash is salted per row, so you cannot look a password
 * up — you can only verify one you were given for a known user. A code arrives
 * with no user attached, so it has to be *found* by its hash, which needs a
 * deterministic one. That is safe here because a code is high-entropy random
 * rather than something a human chose: there is no dictionary to run against it.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/** Characters used in generated codes. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** Length of a generated code. 10 characters of this alphabet is ~50 bits. */
export const CODE_LENGTH = 10

/**
 * Generate an invite code.
 *
 * The alphabet omits `I`, `O`, `0` and `1`, because these get read aloud and
 * typed by hand — confusing them costs someone a support message.
 */
export function generateInviteCode(): string {
  const bytes = randomBytes(CODE_LENGTH)
  let code = ''
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += ALPHABET[(bytes[i] ?? 0) % ALPHABET.length]
  }
  return code
}

/** Fold a code to its canonical form before hashing or comparing. */
export function normaliseInviteCode(code: string): string {
  return code.trim().toUpperCase().replace(/[\s-]/g, '')
}

export function hashInviteCode(code: string): string {
  return createHash('sha256').update(normaliseInviteCode(code)).digest('hex')
}

/** Constant-time comparison, for the rare path that compares two hashes. */
export function hashesMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8')
  const right = Buffer.from(b, 'utf8')
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}
