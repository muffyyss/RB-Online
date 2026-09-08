/**
 * Account rules — shared by the client and the server.
 *
 * The client validates as you type so a registration form can say what is wrong
 * before you submit; the server validates again because a client is never
 * trusted. Both use *these* rules, so the form can never accept something the
 * server will refuse.
 *
 * Uniqueness is not here: it needs the database, and is checked server-side
 * only (see the registration service).
 */

import { z } from 'zod'

// ---------------------------------------------------------------------------
// Username
// ---------------------------------------------------------------------------

export const USERNAME_MIN = 3
export const USERNAME_MAX = 16

/**
 * Letters, digits, underscore and hyphen.
 *
 * Deliberately narrow: usernames are shown to other players and used in room
 * invites, so characters that can be confused for one another or that break
 * layout are excluded. Uniqueness is enforced case-insensitively by the
 * database, so `Muffy` and `muffy` cannot both exist.
 */
export const USERNAME_PATTERN = /^[a-zA-Z0-9_-]+$/

export const usernameSchema = z
  .string()
  .trim()
  .min(USERNAME_MIN, `Username must be at least ${String(USERNAME_MIN)} characters.`)
  .max(USERNAME_MAX, `Username must be at most ${String(USERNAME_MAX)} characters.`)
  .regex(USERNAME_PATTERN, 'Username can only use letters, numbers, underscores and hyphens.')

/** Reserved names, so nobody can impersonate the system or a moderator. */
const RESERVED = new Set([
  'admin',
  'administrator',
  'moderator',
  'mod',
  'system',
  'server',
  'riftbound',
  'riot',
  'support',
  'help',
  'staff',
  'official',
  'null',
  'undefined',
  'me',
  'you',
])

export function isReservedUsername(username: string): boolean {
  return RESERVED.has(username.trim().toLowerCase())
}

/** The form used for uniqueness comparison (150.1-style folding, lowercased). */
export function normaliseUsername(username: string): string {
  return username.trim().toLowerCase()
}

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

export const EMAIL_MAX = 254 // the practical limit for an address in transit

export const emailSchema = z
  .string()
  .trim()
  .max(EMAIL_MAX, 'That email address is too long.')
  .email('That does not look like an email address.')

/**
 * Lowercased and trimmed.
 *
 * The local part of an address is technically case-sensitive, but no real mail
 * provider treats it that way, and allowing `Sam@x.com` and `sam@x.com` as
 * separate accounts invites impersonation. Uniqueness uses this form.
 */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase()
}

// ---------------------------------------------------------------------------
// Password
// ---------------------------------------------------------------------------

export const PASSWORD_MIN = 8
export const PASSWORD_MAX = 16

/**
 * Letters and digits only — no symbols.
 *
 * Set by the project owner. Worth recording that this is narrower than current
 * security guidance recommends: forbidding symbols and capping length shrinks
 * the search space considerably. It is a deliberate product decision, not an
 * oversight, and argon2id hashing compensates for a good deal of it.
 */
export const PASSWORD_PATTERN = /^[a-zA-Z0-9]+$/

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN, `Password must be at least ${String(PASSWORD_MIN)} characters.`)
  .max(PASSWORD_MAX, `Password must be at most ${String(PASSWORD_MAX)} characters.`)
  .regex(PASSWORD_PATTERN, 'Password can only use letters and numbers.')

/**
 * Passwords that pass the rules but are still terrible.
 *
 * With symbols forbidden and length capped at 16, the space is small enough
 * that the obvious guesses are worth refusing outright.
 */
const COMMON_PASSWORDS = new Set([
  'password',
  'password1',
  'password12',
  'password123',
  'passw0rd',
  '12345678',
  '123456789',
  '1234567890',
  'qwertyui',
  'qwerty123',
  'abc12345',
  'iloveyou',
  'sunshine',
  'princess',
  'football',
  'baseball',
  'welcome1',
  'admin123',
  'letmein1',
  'monkey12',
  'riftbound',
  'riftbound1',
])

export function isCommonPassword(password: string): boolean {
  return COMMON_PASSWORDS.has(password.toLowerCase())
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export const registerRequestSchema = z.object({
  username: usernameSchema,
  email: emailSchema,
  password: passwordSchema,
  /** Registration is invite-gated; a code is always required. */
  inviteCode: z.string().trim().min(1, 'An invite code is required.'),
  /** Must be explicitly ticked, not defaulted. */
  acceptedTerms: z.literal(true, { message: 'You must accept the terms to register.' }),
})

export type RegisterRequest = z.infer<typeof registerRequestSchema>

/**
 * `form` covers problems that belong to no single field — most importantly the
 * payload not being an object at all. Without it, junk input would map to zero
 * field errors and a caller checking `errors.length === 0` would treat `null`
 * as a valid registration.
 */
export type RegisterErrorField =
  'username' | 'email' | 'password' | 'inviteCode' | 'acceptedTerms' | 'form'

export type RegisterFieldError = {
  readonly field: RegisterErrorField
  readonly message: string
}

/**
 * Check everything that can be checked without a database.
 *
 * Returns every problem rather than only the first, so a form can mark all its
 * fields at once.
 */
export function checkRegistration(input: unknown): readonly RegisterFieldError[] {
  const parsed = registerRequestSchema.safeParse(input)
  const errors: RegisterFieldError[] = []

  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = issue.path[0]
      if (
        field === 'username' ||
        field === 'email' ||
        field === 'password' ||
        field === 'inviteCode' ||
        field === 'acceptedTerms'
      ) {
        errors.push({ field, message: issue.message })
      }
    }
    // A failed parse must never yield an empty list: anything unattributable
    // becomes a form-level error so `errors.length === 0` always means valid.
    if (errors.length === 0) {
      errors.push({ field: 'form', message: 'That registration is not valid.' })
    }
    return errors
  }

  if (isReservedUsername(parsed.data.username)) {
    errors.push({ field: 'username', message: 'That username is reserved.' })
  }
  if (isCommonPassword(parsed.data.password)) {
    errors.push({ field: 'password', message: 'That password is too common.' })
  }
  return errors
}
