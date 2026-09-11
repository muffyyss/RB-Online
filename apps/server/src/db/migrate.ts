/**
 * Applying migrations.
 *
 * Run before starting the server, and after every deploy that changed the
 * schema:
 *
 *   npm run db:migrate -w @rb/server
 *
 * Drizzle records what it has applied in its own table, so running this twice
 * is safe — it is the normal thing to do on every deploy.
 */

import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { dirname, join } from 'node:path'
import postgres from 'postgres'

import { loadConfig } from '../config.js'

/** Where the generated SQL lives, relative to this file. */
export function migrationsFolder(): string {
  // src/db/migrate.ts -> apps/server/drizzle
  return join(dirname(dirname(import.meta.dirname)), 'drizzle')
}

async function main(): Promise<void> {
  const config = loadConfig()
  // A single connection, and `max: 1`: migrations must not run concurrently.
  const client = postgres(config.DATABASE_URL, { max: 1 })
  try {
    console.log('applying migrations...')
    await migrate(drizzle(client), { migrationsFolder: migrationsFolder() })
    console.log('done.')
  } finally {
    await client.end()
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
