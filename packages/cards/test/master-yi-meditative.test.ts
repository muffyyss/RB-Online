import { describe, expect, it } from 'vitest'

import card from '../src/sets/ogs/master-yi-meditative.js'
import { mightOf } from '@rb/engine'

import { base, mainPhase, oracle } from './support/game.js'

describe('OGS-004 Master Yi, Meditative', () => {
  it('matches the printed card', () => {
    expect(card).toMatchObject({
      name: 'Master Yi',
      subtitle: 'Meditative',
      type: 'unit',
      supertypes: ['champion'],
      tags: ['Master Yi', 'Ionia'],
      domains: ['calm'],
      cost: { energy: 5, power: [{ kind: 'domain', domain: 'calm' }] },
      might: 4,
    })
  })

  it('has +4 Might while its player has 8 or more runes', () => {
    const withRunes = (count: number) => {
      const state = mainPhase([
        { id: 'yi', cardId: 'OGS-004', owner: 0, at: base(0) },
        ...Array.from({ length: count }, (_, i) => ({
          id: `rune-${String(i)}`,
          cardId: 'OGN-126',
          owner: 0 as const,
          at: base(0),
          exhausted: i % 2 === 0, // exhausted runes count too
        })),
      ])
      const yi = state.objects.yi
      if (!yi) throw new Error('missing unit')
      return mightOf(state, yi, oracle)
    }
    expect(withRunes(7)).toBe(4)
    expect(withRunes(8)).toBe(8)
  })
})
