/**
 * Deck presets and deck codes.
 *
 * A preset is a saved deck with a name. Presets live **on the player's machine**,
 * not on the server — there is no deck table and no sync. That keeps the server
 * simple and the data yours.
 *
 * What that does *not* change: when a match starts the client sends its
 * decklist and the server validates it with `validateDeck` before play begins.
 * Local storage decides where a deck lives between games; it never decides
 * whether a deck is legal. A modified client that saved an illegal preset gets
 * rejected at the door.
 *
 * Because presets are local, they do not follow a player to another machine and
 * a reinstall loses them — so a deck code is the way to back one up or hand it
 * to someone else. The format is deliberately plain text rather than an opaque
 * blob: it can be read, diffed, pasted into a chat, and debugged by eye.
 */

import type { DeckList } from '../flow/setup.js'
import type { CardId } from '../state/game-state.js'

/** A saved deck, as stored locally by the client. */
export interface DeckPreset {
  /** Stable local id, so renaming a preset does not orphan it. */
  readonly id: string
  readonly name: string
  readonly deck: DeckList
  /** Epoch milliseconds. Supplied by the caller — the engine never reads a clock. */
  readonly updatedAt: number
}

/** Current deck-code format version. Bumped if the format ever changes. */
export const DECK_CODE_VERSION = 'RB1'

const SECTION = '|'
const ENTRY = ','
const COUNT = 'x'

function encodeCards(cards: readonly CardId[]): string {
  // Run-length by card id, in first-appearance order, so the same deck always
  // encodes to the same string regardless of how it was assembled.
  const counts = new Map<CardId, number>()
  for (const id of cards) counts.set(id, (counts.get(id) ?? 0) + 1)
  return [...counts]
    .map(([id, count]) => (count === 1 ? id : `${String(count)}${COUNT}${id}`))
    .join(ENTRY)
}

function decodeCards(section: string): CardId[] {
  if (section === '') return []
  const cards: CardId[] = []
  for (const entry of section.split(ENTRY)) {
    const match = /^(?:(\d+)x)?(.+)$/.exec(entry.trim())
    if (!match) continue
    const count = match[1] === undefined ? 1 : Number(match[1])
    const id = match[2]
    if (id === undefined) continue
    for (let i = 0; i < count; i += 1) cards.push(id)
  }
  return cards
}

/**
 * Encode a deck as a shareable code.
 *
 * `RB1|LEGEND|CHAMPION|3xUNIT,2xSPELL|12xRUNE|BF1,BF2,BF3`
 */
export function encodeDeck(deck: DeckList): string {
  return [
    DECK_CODE_VERSION,
    deck.legend,
    deck.champion,
    encodeCards(deck.main),
    encodeCards(deck.runes),
    encodeCards(deck.battlefields),
  ].join(SECTION)
}

export type DeckCodeError = 'wrong-version' | 'malformed'

export type DeckCodeResult =
  | { readonly ok: true; readonly deck: DeckList }
  | { readonly ok: false; readonly error: DeckCodeError }

/**
 * Decode a deck code.
 *
 * Structural only: this checks the code parses, not that the deck is legal or
 * that the cards exist. Run `validateDeck` on the result — a code shared from a
 * newer card set will parse cleanly and still be unplayable here.
 */
export function decodeDeck(code: string): DeckCodeResult {
  const parts = code.trim().split(SECTION)
  if (parts.length !== 6) return { ok: false, error: 'malformed' }

  const [version, legend, champion, main, runes, battlefields] = parts
  if (version !== DECK_CODE_VERSION) return { ok: false, error: 'wrong-version' }
  if (legend === undefined || legend === '') return { ok: false, error: 'malformed' }
  if (champion === undefined || champion === '') return { ok: false, error: 'malformed' }

  return {
    ok: true,
    deck: {
      legend,
      champion,
      main: decodeCards(main ?? ''),
      runes: decodeCards(runes ?? ''),
      battlefields: decodeCards(battlefields ?? ''),
    },
  }
}

/**
 * The shape the client writes to disk.
 *
 * Versioned so a future format change can migrate rather than discard someone's
 * decks — the whole point of local storage is that it is the only copy.
 */
export interface PresetFile {
  readonly version: 1
  readonly presets: readonly DeckPreset[]
}

export const PRESET_FILE_VERSION = 1

export function emptyPresetFile(): PresetFile {
  return { version: PRESET_FILE_VERSION, presets: [] }
}

/**
 * Read a preset file defensively.
 *
 * This is the player's only copy of their decks, and it is a plain file on
 * their disk that anything could have corrupted. A malformed file returns an
 * empty set rather than throwing, and individual bad presets are dropped rather
 * than taking the good ones with them.
 */
export function parsePresetFile(raw: unknown): PresetFile {
  if (typeof raw !== 'object' || raw === null) return emptyPresetFile()
  const file = raw as { version?: unknown; presets?: unknown }
  if (file.version !== PRESET_FILE_VERSION) return emptyPresetFile()
  if (!Array.isArray(file.presets)) return emptyPresetFile()

  const presets: DeckPreset[] = []
  for (const entry of file.presets) {
    if (typeof entry !== 'object' || entry === null) continue
    const preset = entry as Partial<DeckPreset>
    if (typeof preset.id !== 'string' || typeof preset.name !== 'string') continue
    if (typeof preset.deck !== 'object' || preset.deck === null) continue
    const deck = preset.deck as Partial<DeckList>
    if (typeof deck.legend !== 'string' || typeof deck.champion !== 'string') continue
    if (!Array.isArray(deck.main) || !Array.isArray(deck.runes)) continue
    if (!Array.isArray(deck.battlefields)) continue
    presets.push({
      id: preset.id,
      name: preset.name,
      updatedAt: typeof preset.updatedAt === 'number' ? preset.updatedAt : 0,
      deck: {
        legend: deck.legend,
        champion: deck.champion,
        main: deck.main as CardId[],
        runes: deck.runes as CardId[],
        battlefields: deck.battlefields as CardId[],
      },
    })
  }
  return { version: PRESET_FILE_VERSION, presets }
}

/**
 * Can this player start or join a room?
 *
 * A room needs a deck, so at least one saved preset is required (a product rule,
 * not a rulebook one). This is a UX gate on the client — the server still
 * validates whatever decklist actually arrives.
 */
export function canEnterRoom(presets: readonly DeckPreset[]): boolean {
  return presets.length > 0
}
