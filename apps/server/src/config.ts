/**
 * Server configuration, read from the environment.
 *
 * Validated at startup rather than at first use: a server that boots and then
 * fails on the first registration because a variable was missing is far worse
 * than one that refuses to start and says which variable.
 */

import { z } from 'zod'

const configSchema = z.object({
  /** Postgres connection string. */
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  PORT: z.coerce.number().int().positive().default(3000),
  /** Bind to loopback by default; Caddy is what faces the internet. */
  HOST: z.string().default('127.0.0.1'),

  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  /**
   * Registration attempts allowed per IP per window.
   *
   * Deliberately low. Invite codes are the only thing standing between a
   * stranger and an account, so guessing them must be slow.
   */
  REGISTER_RATE_LIMIT: z.coerce.number().int().positive().default(5),
  REGISTER_RATE_WINDOW: z.string().default('15 minutes'),

  /**
   * Tell a registrant that a username or email is already taken.
   *
   * True suits a private, invite-gated server, where a clear message beats
   * enumeration resistance nobody needs. Set false if registration ever opens.
   */
  REVEAL_DUPLICATES: z
    .string()
    .default('true')
    .transform((value) => value !== 'false'),
})

export type Config = z.infer<typeof configSchema>

/**
 * Read and validate the environment.
 *
 * Throws with every missing or malformed variable listed, not just the first —
 * a deployment usually gets several wrong at once.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = configSchema.safeParse(env)
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n')
    throw new Error(`Invalid server configuration:\n${problems}`)
  }
  return parsed.data
}
