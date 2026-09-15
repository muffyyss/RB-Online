import { describe, expect, it } from 'vitest'

import card from '../src/sets/ogs/lux-illuminated.js'
import { act, base, field, mainPhase, settle } from './support/game.js'

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
      // Something for the spell to target, or it could not be played (355.8).
      { id: 'foe', cardId: 'OGN-088', owner: 1, at: field('bf-0') },
    ])

  it('gets +3 Might this turn when its player plays a spell that costs 5 or more', () => {
    const cast = act(scene('OGN-085'), { type: 'play-card', player: 0, card: 'spell' }) // Falling Comet, 5
    // It picks its target first (355.5); the trigger joins once it is played.
    const played = act(cast, { type: 'resolve-choice', player: 0, chosen: ['foe'] })
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
