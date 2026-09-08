/**
 * Password hashing.
 *
 * argon2id, which is the current recommendation: memory-hard, so a GPU farm
 * gains far less over a normal machine than it would against a fast hash. That
 * matters more here than usual, because the password policy is narrow —
 * letters and digits only, 8 to 16 characters — so the search space is smaller
 * than the rules elsewhere would give. A slow, memory-hard hash is what buys
 * that back.
 *
 * Parameters follow OWASP's argon2id guidance: 19 MiB of memory, two passes,
 * one degree of parallelism.
 */

import { hash, verify } from '@node-rs/argon2'

/** OWASP's recommended argon2id settings. */
const OPTIONS = {
  memoryCost: 19_456, // KiB — 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const

/**
 * Hash a password for storage.
 *
 * The result is a full encoded string carrying the algorithm, parameters and a
 * per-password salt, so raising the cost later does not invalidate existing
 * hashes — each one records how it was made.
 */
export async function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS)
}

/**
 * Check a password against a stored hash.
 *
 * Never throws on a malformed hash: a corrupt row should fail the login, not
 * crash the endpoint and reveal that the row is unusual.
 */
export async function verifyPassword(storedHash: string, password: string): Promise<boolean> {
  try {
    return await verify(storedHash, password, OPTIONS)
  } catch {
    return false
  }
}

/**
 * Spend roughly the same effort as a real verification, and discard it.
 *
 * Called when there is no account to check against, so that a request for a
 * user who does not exist takes about as long as one for a user who does.
 * Without it, response time alone would answer "is this email registered?".
 */
export async function fakeVerify(): Promise<void> {
  await hash('timing-equalisation-only', OPTIONS)
}
