/**
 * A throwaway server for trying the client, with no Postgres to install.
 *
 * Runs the real app against an embedded, in-memory Postgres (PGlite) migrated
 * from the real migration files, and prints a few invite codes to register
 * with. Everything is gone when it stops — accounts, guests, rooms.
 *
 *   npm run dev:memory -w @rb/server
 *
 * Never use this for real players: nothing persists, and the signing secret
 * is regenerated on every start.
 */

import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { randomBytes } from 'node:crypto'
import { dirname, join } from 'node:path'

import { createInvite } from '../src/admin/index.js'
import { buildApp } from '../src/app.js'
import type { Database } from '../src/auth/register.js'
import { loadConfig } from '../src/config.js'

async function main(): Promise<void> {
  const config = loadConfig({
    ...process.env,
    DATABASE_URL: 'pglite://memory',
    JWT_SECRET: randomBytes(48).toString('base64url'),
    LOG_LEVEL: process.env['LOG_LEVEL'] ?? 'warn',
  })

  const client = new PGlite()
  const db = drizzle(client) as unknown as Database
  await migrate(drizzle(client), {
    migrationsFolder: join(dirname(import.meta.dirname), 'drizzle'),
  })

  const invites = []
  for (let i = 0; i < 5; i += 1) {
    invites.push((await createInvite(db, { label: 'dev-memory' })).code)
  }

  const app = await buildApp({ db, config })
  await app.listen({ port: config.PORT, host: config.HOST })

  console.log(`\nIn-memory server on http://${config.HOST}:${String(config.PORT)}`)
  console.log('Nothing is saved. Single-use invite codes for registering:')
  for (const code of invites) console.log(`  ${code}`)
  console.log('\nCtrl+C to stop.\n')

  const stop = async () => {
    await app.close()
    await client.close()
    process.exit(0)
  }
  process.on('SIGINT', () => void stop())
  process.on('SIGTERM', () => void stop())
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
