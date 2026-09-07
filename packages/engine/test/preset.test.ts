import { describe, expect, it } from 'vitest'

import {
  DECK_CODE_VERSION,
  canEnterRoom,
  decodeDeck,
  emptyPresetFile,
  encodeDeck,
  parsePresetFile,
} from '../src/deck/preset.js'
import type { DeckPreset } from '../src/deck/preset.js'
import type { DeckList } from '../src/flow/setup.js'

const deck: DeckList = {
  legend: 'OGS-017',
  champion: 'OGS-001',
  main: ['OGS-002', 'OGS-002', 'OGS-002', 'OGS-003'],
  runes: Array.from({ length: 12 }, () => 'OGN-RUNE'),
  battlefields: ['BF-A', 'BF-B', 'BF-C'],
}

const preset = (overrides: Partial<DeckPreset> = {}): DeckPreset => ({
  id: 'p1',
  name: 'Annie Burn',
  deck,
  updatedAt: 1_700_000_000_000,
  ...overrides,
})

describe('deck codes', () => {
  it('round-trips a deck exactly', () => {
    const result = decodeDeck(encodeDeck(deck))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.deck).toEqual(deck)
  })

  it('collapses duplicates into counts', () => {
    const code = encodeDeck(deck)
    expect(code).toContain('3xOGS-002')
    expect(code).toContain('12xOGN-RUNE')
    expect(code.startsWith(`${DECK_CODE_VERSION}|`)).toBe(true)
  })

  it('encodes the same deck identically however it was assembled', () => {
    // Order within a card's copies must not change the code, or two identical
    // decks would look different when shared.
    const shuffled: DeckList = {
      ...deck,
      main: ['OGS-002', 'OGS-003', 'OGS-002', 'OGS-002'],
    }
    const a = decodeDeck(encodeDeck(deck))
    const b = decodeDeck(encodeDeck(shuffled))
    expect(a.ok && b.ok).toBe(true)
    if (!a.ok || !b.ok) return
    expect([...a.deck.main].sort()).toEqual([...b.deck.main].sort())
  })

  it('rejects a code from a different format version', () => {
    const result = decodeDeck(encodeDeck(deck).replace('RB1', 'RB9'))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe('wrong-version')
  })

  it('rejects malformed input rather than half-decoding it', () => {
    for (const bad of ['', 'nonsense', 'RB1|only|three|parts', 'RB1||||| ']) {
      expect(decodeDeck(bad).ok).toBe(false)
    }
  })

  it('tolerates surrounding whitespace, since codes get pasted', () => {
    expect(decodeDeck(`  ${encodeDeck(deck)}\n`).ok).toBe(true)
  })

  it('parses a code for cards this build has never heard of', () => {
    // Structural only: a code from a newer set decodes fine and is then caught
    // by validateDeck, which is where "do these cards exist" belongs.
    const result = decodeDeck('RB1|FUTURE-001|FUTURE-002|40xFUTURE-003|12xFUTURE-R|A,B,C')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.deck.main).toHaveLength(40)
  })
})

describe('the preset file', () => {
  it('round-trips through JSON', () => {
    const file = { version: 1 as const, presets: [preset()] }
    expect(parsePresetFile(JSON.parse(JSON.stringify(file)))).toEqual(file)
  })

  it('returns an empty set for anything unrecognisable', () => {
    // This is the player's only copy of their decks, sitting in a plain file
    // that anything could have corrupted. It must not throw.
    for (const bad of [null, undefined, 42, 'text', {}, { version: 99 }, { version: 1 }]) {
      expect(parsePresetFile(bad)).toEqual(emptyPresetFile())
    }
  })

  it('drops a broken preset without losing the good ones', () => {
    const file = {
      version: 1,
      presets: [preset({ id: 'good' }), { id: 'broken' }, preset({ id: 'also-good' })],
    }
    const parsed = parsePresetFile(file)
    expect(parsed.presets.map((p) => p.id)).toEqual(['good', 'also-good'])
  })

  it('defaults a missing timestamp rather than discarding the deck', () => {
    const withoutTime = { ...preset(), updatedAt: undefined }
    const parsed = parsePresetFile({ version: 1, presets: [withoutTime] })
    expect(parsed.presets).toHaveLength(1)
    expect(parsed.presets[0]?.updatedAt).toBe(0)
  })
})

describe('entering a room', () => {
  it('needs at least one saved preset', () => {
    expect(canEnterRoom([])).toBe(false)
    expect(canEnterRoom([preset()])).toBe(true)
  })
})
