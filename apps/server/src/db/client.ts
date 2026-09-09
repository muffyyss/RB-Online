/**
 * The database connection.
 *
 * `postgres-js` rather than `pg`: it is what drizzle's Postgres driver is built
 * around, and it handles prepared statements and connection pooling without
 * extra configuration.
 */

import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import type { Database } from '../auth/register.js'

export interface Connection {
  readonly db: Database
  readonly close: () => Promise<void>
}

/**
 * Connect to Postgres.
 *
 * The pool is small on purpose. This is a server for a handful of friends, and
 * a large pool on a single Windows box buys nothing but memory.
 */
export function connect(databaseUrl: string, max = 10): Connection {
  const client = postgres(databaseUrl, { max })
  return {
    db: drizzle(client),
    close: async () => {
      await client.end()
    },
  }
}
