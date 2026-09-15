import { describe, expect, it } from 'vitest'

import card from '../src/sets/ogs/decisive-strike.js'
import { act, base, field, mainPhase, settle } from './support/game.js'

describe('OGS-024 Decisive Strike', () => {
  it('matches the printed card', () => {
    expect(card).toMatchObject({
      name: 'Decisive Strike',
      type: 'spell',
      supertypes: ['signature'],
      tags: ['Garen'],
      domains: ['body', 'order'],
      // One [C]: Body or Order pays it (135.2.e.6.c).
      cost: { energy: 5, power: [{ kind: 'self' }] },
      keywords: ['action'],
    })
  })

  it('gives every friendly unit +2 Might this turn, and no enemy', () => {
    const start = mainPhase([
      { id: 'spell', cardId: 'OGS-024', owner: 0, at: 'hand' },
      { id: 'home', cardId: 'OGN-219', owner: 0, at: base(0) },
      { id: 'away', cardId: 'OGN-219', owner: 0, at: field('bf-0') },
      { id: 'foe', cardId: 'OGN-219', owner: 1, at: field('bf-1') },
    ])
    const after = settle(act(start, { type: 'play-card', player: 0, card: 'spell' }))
    expect(after.objects.home?.mightThisTurn).toBe(2)
    expect(after.objects.away?.mightThisTurn).toBe(2)
    expect(after.objects.foe?.mightThisTurn).toBeUndefined()
    // A Might bonus, not Buffs: nothing stays after the turn (702).
    expect(after.objects.home?.buffs).toBe(0)
  })
})
