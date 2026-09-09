/**
 * Admin command line.
 *
 * The way in from outside the application. Registration needs an invite code
 * and issuing a code needs an administrator, so without this the first account
 * could never exist.
 *
 * Run from the repo root:
 *
 *   npm run admin -- invite create --uses 1 --days 7 --label "for Sam"
 *   npm run admin -- invite list
 *   npm run admin -- user list
 *   npm run admin -- user suspend muffy
 *   npm run admin -- user promote muffy
 *
 * Needs DATABASE_URL, the same one the server uses.
 */

import { loadConfig } from './config.js'
import { connect } from './db/client.js'
import {
  createInvite,
  listInvites,
  listUsers,
  revokeInvite,
  setUserRole,
  setUserStatus,
} from './admin/index.js'
import type { Database } from './auth/register.js'

const USAGE = `
Riftbound Online — admin

  invite create [--uses N] [--days N] [--label TEXT]
      Issue an invite code. The code is printed ONCE and cannot be recovered:
      only its hash is stored.

  invite list
      Show issued codes: label, uses and expiry. Not the codes themselves.

  invite revoke <id>
      Make a code unusable, keeping the record of who used it.

  user list
      Show accounts.

  user suspend <username>
  user activate <username>
      Change whether an account can play.

  user promote <username>
  user demote <username>
      Grant or remove administrator.
`.trim()

function flag(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(`--${name}`)
  return index >= 0 ? args[index + 1] : undefined
}

function numberFlag(args: readonly string[], name: string): number | undefined {
  const raw = flag(args, name)
  if (raw === undefined) return undefined
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`--${name} must be a positive number, got "${raw}"`)
  }
  return value
}

function formatDate(date: Date | null): string {
  return date ? date.toISOString().slice(0, 16).replace('T', ' ') : '—'
}

async function runInvite(db: Database, args: readonly string[]): Promise<number> {
  const [action, ...rest] = args

  if (action === 'create') {
    const maxUses = numberFlag(rest, 'uses')
    const expiresInDays = numberFlag(rest, 'days')
    const label = flag(rest, 'label')
    const invite = await createInvite(db, {
      ...(maxUses === undefined ? {} : { maxUses }),
      ...(expiresInDays === undefined ? {} : { expiresInDays }),
      ...(label === undefined ? {} : { label }),
    })

    console.log('')
    console.log(`  invite code:  ${invite.code}`)
    console.log(`  uses:         ${String(invite.maxUses)}`)
    console.log(`  expires:      ${formatDate(invite.expiresAt)}`)
    console.log('')
    console.log('  Copy it now — only a hash is stored, so it cannot be shown again.')
    console.log('')
    return 0
  }

  if (action === 'list') {
    const invites = await listInvites(db)
    if (invites.length === 0) {
      console.log('No invite codes yet. Create one with: invite create')
      return 0
    }
    console.log('')
    console.log('  uses    expires           created           label')
    console.log('  ' + '-'.repeat(66))
    for (const invite of invites) {
      const uses = `${String(invite.usedCount)}/${String(invite.maxUses)}`
      const spent = invite.usedCount >= invite.maxUses ? ' (spent)' : ''
      console.log(
        `  ${uses.padEnd(7)} ${formatDate(invite.expiresAt).padEnd(17)} ` +
          `${formatDate(invite.createdAt).padEnd(17)} ${invite.label ?? ''}${spent}`,
      )
    }
    console.log('')
    return 0
  }

  if (action === 'revoke') {
    const id = rest[0]
    if (!id) {
      console.error('Usage: invite revoke <id>')
      return 1
    }
    const done = await revokeInvite(db, id)
    console.log(done ? 'Revoked.' : 'No invite code with that id.')
    return done ? 0 : 1
  }

  console.error(USAGE)
  return 1
}

async function runUser(db: Database, args: readonly string[]): Promise<number> {
  const [action, username] = args

  if (action === 'list') {
    const accounts = await listUsers(db)
    if (accounts.length === 0) {
      console.log('No accounts yet.')
      return 0
    }
    console.log('')
    console.log('  username           status      role     created           email')
    console.log('  ' + '-'.repeat(78))
    for (const user of accounts) {
      console.log(
        `  ${user.username.padEnd(18)} ${user.status.padEnd(11)} ${user.role.padEnd(8)} ` +
          `${formatDate(user.createdAt).padEnd(17)} ${user.email}`,
      )
    }
    console.log('')
    return 0
  }

  if (!username) {
    console.error(`Usage: user ${action ?? '<action>'} <username>`)
    return 1
  }

  const actions: Record<string, () => Promise<boolean>> = {
    suspend: () => setUserStatus(db, username, 'suspended'),
    activate: () => setUserStatus(db, username, 'active'),
    promote: () => setUserRole(db, username, 'admin'),
    demote: () => setUserRole(db, username, 'player'),
  }

  const run = action ? actions[action] : undefined
  if (!run) {
    console.error(USAGE)
    return 1
  }

  const done = await run()
  console.log(done ? `Done: ${action} ${username}` : `No account named "${username}".`)
  return done ? 0 : 1
}

async function main(): Promise<number> {
  const [group, ...args] = process.argv.slice(2)

  if (!group || group === 'help' || group === '--help') {
    console.log(USAGE)
    return group ? 0 : 1
  }

  const config = loadConfig()
  const connection = connect(config.DATABASE_URL, 2)
  try {
    if (group === 'invite') return await runInvite(connection.db, args)
    if (group === 'user') return await runUser(connection.db, args)
    console.error(USAGE)
    return 1
  } finally {
    await connection.close()
  }
}

main()
  .then((code) => {
    process.exit(code)
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
