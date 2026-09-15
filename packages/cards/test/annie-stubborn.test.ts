import { describe, expect, it } from 'vitest'

import card from '../src/sets/ogs/annie-stubborn.js'
import { act, mainPhase, settle } from './support/game.js'

describe('OGS-010 Annie, Stubborn', () => {
  it('matches the printed card', () => {
    expect(card).toMatchObject({
      name: 'Annie',
      subtitle: 'Stubborn',
      type: 'unit',
      supertypes: ['champion'],
      tags: ['Annie', 'Noxus'],
      domains: ['chaos'],
      cost: { energy: 4, power: [{ kind: 'domain', domain: 'chaos' }] },
      might: 3,
    })
  })

  it("returns a spell of its player's choice from their trash when played", () => {
    const start = mainPhase([
      { id: 'annie', cardId: 'OGS-010', owner: 0, at: 'hand' },
      { id: 'spell', cardId: 'OGS-003', owner: 0, at: 'trash' }, // Incinerate
      { id: 'unit', cardId: 'OGN-219', owner: 0, at: 'trash' },
      { id: 'theirs', cardId: 'OGS-003', owner: 1, at: 'trash' },
    ])
    let offered: readonly string[] = []
    const after = settle(act(start, { type: 'play-card', player: 0, card: 'annie' }), (c) => {
      offered = c
      return ['spell']
    })
    expect(offered).toEqual(['spell']) // not a unit, not the opponent's
    expect(after.objects.spell?.zone).toBe('hand')
    expect(after.players[0].hand).toEqual(['spell'])
    expect(after.players[0].trash).toEqual(['unit'])
  })

  it('does nothing when there is no spell in the trash', () => {
    const start = mainPhase([{ id: 'annie', cardId: 'OGS-010', owner: 0, at: 'hand' }])
    const after = settle(act(start, { type: 'play-card', player: 0, card: 'annie' }))
    expect(after.objects.annie?.zone).toBe('base')
    expect(after.players[0].hand).toEqual([])
  })
})
