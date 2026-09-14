import { describe, expect, it } from 'vitest'

import { decodeDeck, encodeDeck, validateDeck } from '@rb/engine'

import { PROVING_GROUNDS_DECKS } from '../src/decks/proving-grounds.js'
import { cardOracle } from '../src/oracle.js'
import { getCard } from '../src/registry.js'

const oracle = cardOracle()

describe('the Proving Grounds decks', () => {
  it('are the four boxed decks', () => {
    expect(PROVING_GROUNDS_DECKS.map((d) => d.id)).toEqual([
      'ogs-annie',
      'ogs-lux',
      'ogs-garen',
      'ogs-master-yi',
    ])
  })

  describe.each(PROVING_GROUNDS_DECKS)('$name', ({ deck, format }) => {
    it('uses only cards that exist', () => {
      const ids = [deck.legend, deck.champion, ...deck.main, ...deck.runes, ...deck.battlefields]
      for (const id of new Set(ids)) expect(getCard(id), id).toBeDefined()
    })

    it('has 40 main deck cards counting the champion, 12 runes and one battlefield', () => {
      expect(deck.main.length + 1).toBe(40)
      expect(deck.runes).toHaveLength(12)
      expect(deck.battlefields).toHaveLength(1)
    })

    it('is legal in the starter format', () => {
      const result = validateDeck(deck, oracle, format)
      expect(result.errors).toEqual([])
      expect(result.valid).toBe(true)
    })

    it('fails a Duel only for bringing one battlefield, not three (485.4.a)', () => {
      const codes = validateDeck(deck, oracle, 'duel').errors.map((e) => e.code)
      expect(codes).toEqual(['battlefield-count'])
    })

    it('survives a trip through a deck code, which is how presets travel', () => {
      const decoded = decodeDeck(encodeDeck(deck))
      expect(decoded.ok).toBe(true)
      if (!decoded.ok) return
      expect([...decoded.deck.main].sort()).toEqual([...deck.main].sort())
      expect(decoded.deck.champion).toBe(deck.champion)
    })
  })
})
