import { describe, expect, it } from 'vitest'

import card from '../src/sets/ogs/annie-fiery.js'
import { act, field, mainPhase, settle } from './support/game.js'

describe('OGS-001 Annie, Fiery', () => {
  it('matches the printed card', () => {
    expect(card).toMatchObject({
      name: 'Annie',
      subtitle: 'Fiery',
      type: 'unit',
      supertypes: ['champion'],
      tags: ['Annie', 'Noxus'],
      domains: ['fury'],
      cost: { energy: 5, power: [{ kind: 'domain', domain: 'fury' }] },
      might: 4,
    })
  })

  const incinerate = (annieOwner: 0 | 1) =>
    settle(
      act(
        mainPhase([
          { id: 'annie', cardId: 'OGS-001', owner: annieOwner, at: field('bf-1') },
          { id: 'spell', cardId: 'OGS-003', owner: 0, at: 'hand' }, // Deal 2
          { id: 'foe', cardId: 'OGN-088', owner: 1, at: field('bf-0') }, // 8 Might
        ]),
        { type: 'play-card', player: 0, card: 'spell' },
      ),
      () => ['foe'],
    )

  it("adds 1 Bonus Damage to her controller's spells (715.1)", () => {
    expect(incinerate(0).objects.foe?.damage).toBe(3)
  })

  it("does nothing for the opponent's spells", () => {
    expect(incinerate(1).objects.foe?.damage).toBe(2)
  })
})
