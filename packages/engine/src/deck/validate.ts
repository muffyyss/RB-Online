/**
 * Deck legality (103).
 *
 * **This is the single source of truth for whether a deck is legal**, and it
 * runs unchanged on the client and the server. The deck builder uses it to show
 * what is wrong while you edit; the server runs the same function before a match
 * starts. A client must never be able to show "legal" for a deck the server
 * would reject, and the only way to guarantee that is one implementation.
 *
 * Errors are returned as a list rather than thrown on the first problem, because
 * a deck builder needs to show everything that is wrong at once.
 */

import type { CardOracle } from '../effects/oracle.js'
import { fullName } from '../model/card.js'
import type { Domain } from '../model/domain.js'
import { isWithinIdentity } from '../model/domain.js'
import type { DeckList } from '../flow/setup.js'
import type { CardId } from '../state/game-state.js'

/** Minimum Main Deck size, counting the Chosen Champion (103.2). */
export const MIN_MAIN_DECK = 40

/** Exact Rune Deck size (103.3.a). */
export const RUNE_DECK_SIZE = 12

/** Copies of any one named card, Chosen Champion included (103.2.b, 103.2.b.1). */
export const MAX_COPIES = 3

/** Signature cards a deck may hold in total, regardless of name (103.2.d.1). */
export const MAX_SIGNATURE = 3

/** Battlefields a Duel deck brings; one is chosen at random at setup (485.4.a). */
export const DUEL_BATTLEFIELDS = 3

export type DeckErrorCode =
  | 'unknown-card'
  | 'legend-not-a-legend'
  | 'champion-not-a-champion'
  | 'champion-tag-mismatch'
  | 'main-deck-too-small'
  | 'main-deck-wrong-types'
  | 'too-many-copies'
  | 'too-many-signature'
  | 'signature-tag-mismatch'
  | 'outside-domain-identity'
  | 'rune-deck-wrong-size'
  | 'rune-deck-wrong-type'
  | 'battlefield-count'
  | 'battlefield-not-a-battlefield'
  | 'duplicate-battlefield'

export interface DeckError {
  readonly code: DeckErrorCode
  /** Human-readable, suitable for showing directly in a deck builder. */
  readonly message: string
  /** The rule this comes from, so the message can be checked against the book. */
  readonly rule: string
  /** The offending card, where one card is to blame. */
  readonly card?: CardId
}

export interface DeckValidation {
  readonly valid: boolean
  readonly errors: readonly DeckError[]
  /** The deck's Domain Identity, derived from its Legend (103.1.b.2). */
  readonly domains: readonly Domain[]
  /** Main Deck size including the Chosen Champion, which counts toward it. */
  readonly mainDeckSize: number
}

/**
 * Check a decklist.
 *
 * The Chosen Champion is stored separately from the rest of the Main Deck
 * because it starts in the Champion Zone (103.2.a.1), but it is *part of* the
 * Main Deck for both the size minimum and the copy limit (103.2, 103.2.b.1).
 * Counting it twice or not at all are both easy mistakes.
 */
export function validateDeck(deck: DeckList, oracle: CardOracle): DeckValidation {
  const errors: DeckError[] = []
  const fail = (code: DeckErrorCode, message: string, rule: string, card?: CardId) => {
    errors.push(card === undefined ? { code, message, rule } : { code, message, rule, card })
  }

  const facts = (id: CardId) => oracle.facts(id)

  // --- Legend, which sets the Domain Identity (103.1) ---
  const legend = facts(deck.legend)
  if (!legend) {
    fail('unknown-card', `unknown card: ${deck.legend}`, '103.1', deck.legend)
    return { valid: false, errors, domains: [], mainDeckSize: 0 }
  }
  if (legend.type !== 'legend') {
    fail('legend-not-a-legend', `${legend.name} is not a legend`, '103.1', deck.legend)
  }

  const domains = legend.domains
  const identity = new Set<Domain>(domains)
  const championTags = new Set(legend.tags)

  // --- Chosen Champion (103.2.a) ---
  const champion = facts(deck.champion)
  if (!champion) {
    fail('unknown-card', `unknown card: ${deck.champion}`, '103.2.a', deck.champion)
  } else {
    const isChampionUnit =
      champion.type === 'unit' && (champion.supertypes?.includes('champion') ?? false)
    if (!isChampionUnit) {
      fail(
        'champion-not-a-champion',
        `${champion.name} is not a champion unit`,
        '103.2.a.2',
        deck.champion,
      )
    }
    // 103.2.a.2 - its champion tag must match the tag on the Champion Legend.
    if (!champion.tags.some((tag) => championTags.has(tag))) {
      fail(
        'champion-tag-mismatch',
        `${champion.name} does not share a champion tag with ${legend.name}`,
        '103.2.a.2',
        deck.champion,
      )
    }
  }

  // --- Main Deck (103.2) ---
  // The Chosen Champion is part of the Main Deck even though it starts elsewhere.
  const mainCards = [deck.champion, ...deck.main]
  const mainDeckSize = mainCards.length

  if (mainDeckSize < MIN_MAIN_DECK) {
    fail(
      'main-deck-too-small',
      `main deck has ${String(mainDeckSize)} cards, needs at least ${String(MIN_MAIN_DECK)}`,
      '103.2',
    )
  }

  const copies = new Map<string, number>()
  let signatureCount = 0

  for (const id of mainCards) {
    const card = facts(id)
    if (!card) {
      fail('unknown-card', `unknown card: ${id}`, '103.2', id)
      continue
    }

    // 103.2 - a Main Deck holds Units, Gear and Spells.
    if (card.type !== 'unit' && card.type !== 'gear' && card.type !== 'spell') {
      fail(
        'main-deck-wrong-types',
        `${card.name} is a ${card.type} and cannot be in the main deck`,
        '103.2',
        id,
      )
    }

    // 103.2.b.2 - cards with different names are different cards, even when
    // they depict the same character, so the limit counts full names.
    const name = fullName(card.name)
    copies.set(name, (copies.get(name) ?? 0) + 1)

    if (card.supertypes?.includes('signature')) {
      signatureCount += 1
      // 103.2.d.2 - every Signature card must carry the Legend's champion tag.
      if (!card.tags.some((tag) => championTags.has(tag))) {
        fail(
          'signature-tag-mismatch',
          `${card.name} is a signature card but does not share a champion tag with ${legend.name}`,
          '103.2.d.2',
          id,
        )
      }
    }

    // 103.2.c / 103.1.b.4 - a multi-Domain card needs ALL its Domains present.
    if (!isWithinIdentity(card.domains, identity)) {
      fail(
        'outside-domain-identity',
        `${card.name} is outside the deck's domain identity`,
        '103.1.b.4',
        id,
      )
    }
  }

  for (const [name, count] of copies) {
    if (count > MAX_COPIES) {
      fail(
        'too-many-copies',
        `${String(count)} copies of ${name}; the limit is ${String(MAX_COPIES)}`,
        '103.2.b',
      )
    }
  }

  // 103.2.d.1 - a sum total of three, regardless of name.
  if (signatureCount > MAX_SIGNATURE) {
    fail(
      'too-many-signature',
      `${String(signatureCount)} signature cards; the limit is ${String(MAX_SIGNATURE)} in total`,
      '103.2.d.1',
    )
  }

  // --- Rune Deck (103.3) ---
  if (deck.runes.length !== RUNE_DECK_SIZE) {
    fail(
      'rune-deck-wrong-size',
      `rune deck has ${String(deck.runes.length)} cards, needs exactly ${String(RUNE_DECK_SIZE)}`,
      '103.3.a',
    )
  }
  for (const id of deck.runes) {
    const card = facts(id)
    if (!card) {
      fail('unknown-card', `unknown card: ${id}`, '103.3', id)
      continue
    }
    if (card.type !== 'rune') {
      fail('rune-deck-wrong-type', `${card.name} is not a rune`, '103.3.a', id)
    }
    // 103.3.a.1 - runes must be within the Legend's Domain Identity too.
    if (!isWithinIdentity(card.domains, identity)) {
      fail(
        'outside-domain-identity',
        `${card.name} is outside the deck's domain identity`,
        '103.3.a.1',
        id,
      )
    }
  }

  // --- Battlefields (103.4, 485.4.a) ---
  if (deck.battlefields.length !== DUEL_BATTLEFIELDS) {
    fail(
      'battlefield-count',
      `${String(deck.battlefields.length)} battlefields, a duel deck needs ${String(DUEL_BATTLEFIELDS)}`,
      '485.4.a',
    )
  }
  const battlefieldNames = new Set<string>()
  for (const id of deck.battlefields) {
    const card = facts(id)
    if (!card) {
      fail('unknown-card', `unknown card: ${id}`, '103.4', id)
      continue
    }
    if (card.type !== 'battlefield') {
      fail('battlefield-not-a-battlefield', `${card.name} is not a battlefield`, '103.4', id)
      continue
    }
    // 103.4.c - no two battlefields of the same name.
    if (battlefieldNames.has(card.name)) {
      fail('duplicate-battlefield', `two battlefields named ${card.name}`, '103.4.c', id)
    }
    battlefieldNames.add(card.name)
    if (!isWithinIdentity(card.domains, identity)) {
      fail(
        'outside-domain-identity',
        `${card.name} is outside the deck's domain identity`,
        '103.4.b',
        id,
      )
    }
  }

  return { valid: errors.length === 0, errors, domains, mainDeckSize }
}

/** A one-line summary for a deck list UI, e.g. "40 cards · Fury/Chaos". */
export function describeDeck(validation: DeckValidation): string {
  return `${String(validation.mainDeckSize)} cards · ${validation.domains.join('/') || 'no domain'}`
}
