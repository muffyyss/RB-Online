import { describe, expect, it } from 'vitest'

import { encodeDeck } from '@rb/engine'
import type { DeckPreset, PresetFile } from '@rb/engine'

import {
  PRESET_NAME_MAX,
  addStarterDecks,
  addCard,
  cleanName,
  countOf,
  emptyDeck,
  exportDeckCode,
  importDeckCode,
  removeCard,
  removePreset,
  upsertPreset,
} from '../src/shared/presets.js'

const preset = (id: string, name = id): DeckPreset => ({
  id,
  name,
  updatedAt: 0,
  deck: { ...emptyDeck(), legend: 'L', champion: 'C' },
})

const file = (...presets: DeckPreset[]): PresetFile => ({ version: 1, presets })

describe('editing presets', () => {
  it('puts a new or updated preset first, without duplicating it', () => {
    const start = file(preset('a'), preset('b'))
    const updated = upsertPreset(start, preset('b', 'renamed'))
    expect(updated.presets.map((p) => [p.id, p.name])).toEqual([
      ['b', 'renamed'],
      ['a', 'a'],
    ])
  })

  it('removes by id', () => {
    expect(removePreset(file(preset('a'), preset('b')), 'a').presets.map((p) => p.id)).toEqual([
      'b',
    ])
  })

  it('tidies names, and never leaves one blank', () => {
    expect(cleanName('  Lux   ramp ')).toBe('Lux ramp')
    expect(cleanName('   ')).toBe('Untitled deck')
    expect(cleanName('x'.repeat(100))).toHaveLength(PRESET_NAME_MAX)
  })
})

describe('deck codes', () => {
  it('round-trips a preset through export and import', () => {
    const original: DeckPreset = {
      ...preset('a', 'Mine'),
      deck: {
        legend: 'L',
        champion: 'C',
        main: ['X', 'X', 'Y'],
        runes: ['R', 'R'],
        battlefields: ['B1'],
      },
    }
    const imported = importDeckCode(exportDeckCode(original), 'Shared', 'new-id', 5)
    expect(imported).toEqual({
      ok: true,
      preset: { id: 'new-id', name: 'Shared', deck: original.deck, updatedAt: 5 },
    })
  })

  it('explains a code it cannot read', () => {
    expect(importDeckCode('hello', '', 'id', 0)).toMatchObject({
      ok: false,
      message: /not a deck code/,
    })
    expect(importDeckCode('RB9|a|b|||', '', 'id', 0)).toMatchObject({
      ok: false,
      message: /different version/,
    })
  })

  it('names an unnamed import', () => {
    const result = importDeckCode(encodeDeck(preset('a').deck), '  ', 'id', 0)
    expect(result.ok && result.preset.name).toBe('Imported deck')
  })
})

describe('adding and removing cards', () => {
  it('adds and removes one copy at a time', () => {
    let deck = emptyDeck()
    deck = addCard(deck, 'main', 'X')
    deck = addCard(deck, 'main', 'X')
    deck = addCard(deck, 'runes', 'R')
    expect(countOf(deck.main, 'X')).toBe(2)
    deck = removeCard(deck, 'main', 'X')
    expect(countOf(deck.main, 'X')).toBe(1)
    expect(removeCard(deck, 'battlefields', 'nope')).toBe(deck)
  })
})

describe('adding the starter decks', () => {
  const starters = [
    { id: 'ogs-annie', name: 'Annie � Proving Grounds', deck: { ...emptyDeck(), legend: 'A' } },
    { id: 'ogs-lux', name: 'Lux � Proving Grounds', deck: { ...emptyDeck(), legend: 'L' } },
  ]

  it('adds each one once', () => {
    const first = addStarterDecks(file(preset('mine')), starters, 7)
    expect(first.added).toBe(2)
    expect(first.file.presets.map((p) => p.id)).toEqual(['mine', 'ogs-annie', 'ogs-lux'])

    const again = addStarterDecks(first.file, starters, 8)
    expect(again.added).toBe(0)
    expect(again.file.presets).toHaveLength(3)
  })

  it('leaves an edited copy alone', () => {
    const edited = { ...preset('ogs-annie', 'My Annie'), updatedAt: 99 }
    const result = addStarterDecks(file(edited), starters, 7)
    expect(result.file.presets.find((p) => p.id === 'ogs-annie')?.name).toBe('My Annie')
  })
})
