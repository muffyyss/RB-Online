/**
 * card-lint — the gate every card definition has to pass.
 *
 * Checks, in order of how badly each would bite:
 *
 *  1. The definition validates against the schema. (`defineCard` already parses
 *     at import, so a broken card fails on load — this re-checks explicitly so
 *     the report names the card rather than blowing up as a stack trace.)
 *  2. Every card has a test. An untested card is one nobody has ever seen work.
 *  3. Abilities marked `notImplemented` are surfaced, so a card that cannot yet
 *     be played correctly can never be mistaken for one that can.
 *  4. Ids and full names are consistent.
 *
 * Exits non-zero on errors. Warnings are reported but do not fail the build:
 * an incomplete card is a known gap, not a broken one.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { ALL_CARDS, CARD_DATA_VERSION, cardDefinitionSchema, cardFullName } from '@rb/cards'
import type { CardDefinition } from '@rb/cards'
import { IMPLEMENTED_OPS } from '@rb/engine'

/**
 * npm runs a workspace script with that workspace as the cwd, so paths must be
 * resolved from the repo root rather than from wherever we happen to start.
 */
function repoRoot(): string {
  let dir = import.meta.dirname
  for (let depth = 0; depth < 10; depth += 1) {
    const manifest = join(dir, 'package.json')
    if (existsSync(manifest)) {
      const pkg = JSON.parse(readFileSync(manifest, 'utf8')) as { workspaces?: unknown }
      if (pkg.workspaces) return dir
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  throw new Error('could not locate the repo root (no package.json with "workspaces")')
}

const ROOT = repoRoot()
const CARDS_SRC = join(ROOT, 'packages', 'cards', 'src')
const TEST_DIR = join(ROOT, 'packages', 'cards', 'test')

interface Finding {
  readonly card: string
  readonly message: string
}

const errors: Finding[] = []
const warnings: Finding[] = []

const fail = (card: string, message: string) => errors.push({ card, message })
const warn = (card: string, message: string) => warnings.push({ card, message })

/** Collect every `op` used anywhere in a card, including nested steps. */
function opsUsed(card: CardDefinition): Set<string> {
  const ops = new Set<string>()
  const walk = (steps: readonly unknown[]): void => {
    for (const step of steps) {
      if (typeof step !== 'object' || step === null) continue
      const record = step as { op?: unknown; steps?: unknown }
      if (typeof record.op === 'string') ops.add(record.op)
      if (Array.isArray(record.steps)) walk(record.steps)
    }
  }
  for (const ability of card.abilities ?? []) {
    if ('steps' in ability) walk(ability.steps)
  }
  return ops
}

function testFilesFor(): Set<string> {
  if (!existsSync(TEST_DIR)) return new Set()
  const names = new Set<string>()
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (entry.name.endsWith('.test.ts')) names.add(entry.name.replace(/\.test\.ts$/, ''))
    }
  }
  walk(TEST_DIR)
  return names
}

function main(): number {
  if (!existsSync(CARDS_SRC)) {
    console.error(`cards package not found at ${CARDS_SRC}`)
    return 1
  }

  const tests = testFilesFor()
  const seenIds = new Set<string>()

  for (const card of ALL_CARDS) {
    const label = `${card.id} ${cardFullName(card)}`

    // 1. Schema.
    const parsed = cardDefinitionSchema.safeParse(card)
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        fail(label, `${issue.path.join('.') || '(card)'}: ${issue.message}`)
      }
      continue
    }

    // 2. Duplicate ids would make deck lists ambiguous.
    if (seenIds.has(card.id)) fail(label, 'duplicate card id')
    seenIds.add(card.id)

    // 3. Every card needs a test.
    const slug = cardFullName(card)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
    if (!tests.has(slug)) {
      fail(label, `no test — expected packages/cards/test/${slug}.test.ts`)
    }

    // 4. Ops the interpreter does not handle would silently do nothing.
    for (const op of opsUsed(card)) {
      if (!IMPLEMENTED_OPS.includes(op)) {
        fail(label, `uses op "${op}", which the interpreter does not implement`)
      }
    }

    // 5. Known-incomplete abilities.
    for (const ability of card.abilities ?? []) {
      if (ability.notImplemented) {
        warn(label, `${ability.id}: ${ability.notImplemented}`)
      }
    }

    // 6. Printed text is what lets a reviewer check the card against the real one.
    if (!card.text && (card.abilities?.length ?? 0) > 0) {
      warn(label, 'has abilities but no printed `text` to check them against')
    }
  }

  console.log(`card-lint: ${String(ALL_CARDS.length)} card(s), data version ${CARD_DATA_VERSION}`)

  if (warnings.length > 0) {
    console.log(`\n${String(warnings.length)} warning(s):`)
    for (const { card, message } of warnings) console.log(`  ~ ${card}\n      ${message}`)
  }

  if (errors.length > 0) {
    console.error(`\n${String(errors.length)} error(s):`)
    for (const { card, message } of errors) console.error(`  x ${card}\n      ${message}`)
    return 1
  }

  console.log('\nall cards valid')
  return 0
}

process.exit(main())
