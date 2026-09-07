/**
 * Card categories, types and supertypes (133).
 *
 * The rulebook distinguishes a card's *type* (unit, gear, spell, rune,
 * battlefield, legend) from its *category* — which deck it comes from and how it
 * enters play. Category is what decides behaviour, so it is derived from type
 * here rather than stored separately, keeping the two from drifting apart.
 */

/** Every card type in the game (133.4-133.6). */
export const CARD_TYPES = ['unit', 'gear', 'spell', 'rune', 'battlefield', 'legend'] as const

export type CardType = (typeof CARD_TYPES)[number]

/**
 * Supertypes are listed *before* the type and affect deckbuilding (133.7).
 *
 * - `champion` applies only to units (133.7.a) and gates the Chosen Champion slot.
 * - `signature` may apply to any type (133.7.b); a deck may hold at most 3 in
 *   total, all matching the Legend's Champion Tag (103.2.d).
 */
export const SUPERTYPES = ['champion', 'signature'] as const

export type Supertype = (typeof SUPERTYPES)[number]

/**
 * Which deck a card comes from, and therefore how it reaches the board (133.4-133.6).
 *
 * - `main-deck` — played from hand (or the Champion Zone) and paid for.
 * - `rune-deck` — *channeled*, never played (133.5.a.1).
 * - `other` — Battlefields and Legends, which start on the board or in the
 *   Legend Zone and are neither played nor channeled (133.6).
 */
export type CardCategory = 'main-deck' | 'rune-deck' | 'other'

const CATEGORY_BY_TYPE = {
  unit: 'main-deck',
  gear: 'main-deck',
  spell: 'main-deck',
  rune: 'rune-deck',
  battlefield: 'other',
  legend: 'other',
} as const satisfies Record<CardType, CardCategory>

export function categoryOf(type: CardType): CardCategory {
  return CATEGORY_BY_TYPE[type]
}

/**
 * Permanents are Main Deck objects that stay on the board once played: units and
 * gear (133.4.a.2).
 *
 * Runes remain on the board too but are explicitly *not* permanents, because they
 * are not Main Deck cards (161.1.a). Card text that says "permanent" must not
 * catch them.
 */
export function isPermanentType(type: CardType): boolean {
  return type === 'unit' || type === 'gear'
}

/**
 * A Champion Tag links a Legend to its Champion Units and Signature cards
 * (133.8.b). Tags otherwise carry no rules meaning on their own (133.8.a) — they
 * exist only for card text to reference.
 */
export type Tag = string

/**
 * A card's name (132).
 *
 * Where a card has a subtitle, its full name is "[Short Name], [Subtitle]" for
 * every purpose including deckbuilding (132.4). Deck legality counts copies by
 * this full name, so two cards for the same character with different subtitles
 * are different cards and each may appear 3 times (103.2.b.2).
 */
export function fullName(shortName: string, subtitle?: string): string {
  return subtitle ? `${shortName}, ${subtitle}` : shortName
}
