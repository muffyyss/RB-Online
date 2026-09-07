/**
 * The card registry.
 *
 * Every card in every authored set, indexed for lookup, plus a content hash of
 * the whole set. The server is the source of truth for card data: clients
 * download it at login and both sides compare `cardDataVersion` before a match
 * starts. That is what lets a balance change — editing one `amount` — reach
 * every player on their next login without shipping a new client build.
 */

import type { CardDefinition } from './schema.js'
import { cardFullName } from './schema.js'
import { OGS_CARDS } from './sets/ogs/index.js'

/** Every authored card, ordered by id so the content hash is stable. */
export const ALL_CARDS: readonly CardDefinition[] = [...OGS_CARDS].sort((a, b) =>
  a.id.localeCompare(b.id),
)

const BY_ID = new Map(ALL_CARDS.map((card) => [card.id, card]))

export function getCard(id: string): CardDefinition | undefined {
  return BY_ID.get(id)
}

/**
 * Look a card up, throwing if it is missing.
 *
 * Use this wherever a missing card means the caller is broken — a deck
 * referencing an unknown id, say. Failing loudly beats a silent `undefined`
 * propagating into a match.
 */
export function requireCard(id: string): CardDefinition {
  const card = BY_ID.get(id)
  if (!card) throw new Error(`unknown card id: ${id}`)
  return card
}

export function cardsInSet(set: string): readonly CardDefinition[] {
  return ALL_CARDS.filter((card) => card.set === set)
}

/** Full names for deckbuilding, where the copy limit counts by name (103.2.b). */
export function cardsByFullName(): ReadonlyMap<string, readonly CardDefinition[]> {
  const map = new Map<string, CardDefinition[]>()
  for (const card of ALL_CARDS) {
    const name = cardFullName(card)
    const bucket = map.get(name)
    if (bucket) bucket.push(card)
    else map.set(name, [card])
  }
  return map
}

/**
 * FNV-1a over the serialised card data.
 *
 * Deliberately not `node:crypto`: this package must run unchanged in the
 * browser, and the hash only needs to detect *difference*, not resist attack.
 * Sorting keys makes it independent of property order, so a reformat does not
 * look like a balance change.
 */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`)
  return `{${entries.join(',')}}`
}

/**
 * Content hash of the whole card database.
 *
 * Changes whenever any card's data changes. Both sides of a match must agree on
 * it before play begins.
 */
export const CARD_DATA_VERSION: string = fnv1a(stableStringify(ALL_CARDS))
