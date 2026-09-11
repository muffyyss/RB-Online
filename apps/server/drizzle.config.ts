/**
 * drizzle-kit configuration.
 *
 * Generates versioned SQL migrations from `src/db/schema.ts`. The generated
 * files are committed and are what runs against the real database — the schema
 * file describes the intent, the migrations are the history.
 */

import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  // Only needed for `drizzle-kit push`/`studio`, which we do not use: migrations
  // are generated from the schema and applied by our own runner.
  dbCredentials: { url: process.env.DATABASE_URL ?? 'postgres://localhost:5432/riftbound' },
  strict: true,
  verbose: true,
})
