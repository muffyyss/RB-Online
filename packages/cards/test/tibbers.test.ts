import { describe, expect, it } from 'vitest'

import card from '../src/sets/ogs/tibbers.js'
import { act, base, field, mainPhase, settle } from './support/game.js'

describe('OGS-018 Tibbers', () => {
  it('matches the printed card', () => {
    expect(card).toMatchObject({
      name: 'Tibbers',
      type: 'unit',
      supertypes: ['signature'],
      tags: ['Annie'],
      domains: ['chaos', 'fury'],
      // Two [C]: each paid by Fury or Chaos (135.2.e.6.c).
      cost: { energy: 8, power: [{ kind: 'self' }, { kind: 'self' }] },
      might: 7,
    })
  })

  it('when played, deals 3 to every unit at every battlefield, and spares units in base', () => {
    const start = mainPhase([
      { id: 'tibbers', cardId: 'OGS-018', owner: 0, at: 'hand' },
      { id: 'enemy', cardId: 'OGN-013', owner: 1, at: field('bf-0') }, // Pouty Poro, 2 Might
      { id: 'mine', cardId: 'OGN-088', owner: 0, at: field('bf-1') }, // Mega-Mech, 8 Might
      { id: 'safe', cardId: 'OGN-013', owner: 1, at: base(1) },
    ])
    const played = act(start, { type: 'play-card', player: 0, card: 'tibbers' })
    // The unit is on the board first; the blast waits on the Chain (383.4.a.2).
    expect(played.objects.tibbers?.zone).toBe('base')
    expect(played.chain[0]).toMatchObject({ abilityId: 'tibbers-bear-hug' })

    const after = settle(played)
    expect(after.objects.enemy?.zone).toBe('trash')
    expect(after.objects.mine?.damage).toBe(3)
    expect(after.objects.safe?.damage).toBe(0)
    expect(after.objects.tibbers?.damage).toBe(0)
  })
})
