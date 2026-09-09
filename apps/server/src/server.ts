/**
 * Entry point.
 *
 * Reads the environment, connects, serves, and shuts down cleanly when Windows
 * stops the service — an interrupted registration should finish rather than be
 * cut off mid-transaction.
 */

import { buildApp } from './app.js'
import { loadConfig } from './config.js'
import { connect } from './db/client.js'

async function main(): Promise<void> {
  const config = loadConfig()
  const connection = connect(config.DATABASE_URL)
  const app = await buildApp({ db: connection.db, config })

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'shutting down')
    await app.close()
    await connection.close()
    process.exit(0)
  }

  // NSSM sends SIGTERM; Ctrl+C in a console sends SIGINT.
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))

  await app.listen({ port: config.PORT, host: config.HOST })
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
