import { describe, expect, it } from 'vitest'

import card from '../src/sets/ogs/lux-illuminated.js'
import { act, base, mainPhase, settle } from './support/game.js'

describe('OGS-006 Lux, Illuminated', () => {
  it('matches the printed card', () => {
    expect(card).toMatchObject({
      name: 'Lux',
      subtitle: 'Illuminated',
      type: 'unit',
      supertypes: ['champion'],
      tags: ['Lux', 'Demacia'],
      domains: ['mind'],
      cost: { energy: 6, power: [{ kind: 'domain', domain: 'mind' }] },
      might: 5,
    })
  })

  const scene = (spell: string) =>
    mainPhase([
      { id: 'lux', cardId: 'OGS-006', owner: 0, at: base(0) },
      { id: 'spell', cardId: spell, owner: 0, at: 'hand' },
    ])

  it('gets +3 Might this turn when its player plays a spell that costs 5 or more', () => {
    const played = act(scene('OGN-085'), { type: 'play-card', player: 0, card: 'spell' }) // Falling Comet, 5
    expect(played.chain.map((c) => c.abilityId ?? 'spell')).toEqual([
      'spell',
      'lux-illuminated-empowered',
    ])
    expect(settle(played).objects.lux?.mightThisTurn).toBe(3)
  })

  it('does not trigger for a cheaper spell', () => {
    const played = act(scene('OGS-003'), { type: 'play-card', player: 0, card: 'spell' }) // Incinerate, 2
    expect(played.chain.some((c) => c.abilityId === 'lux-illuminated-empowered')).toBe(false)
  })
})
