import { describe, expect, it } from 'vitest'

import card from '../src/sets/ogs/master-yi-honed.js'
import { act, base, field, mainPhase, settle } from './support/game.js'

describe('OGS-009 Master Yi, Honed', () => {
  it('matches the printed card', () => {
    expect(card).toMatchObject({
      name: 'Master Yi',
      subtitle: 'Honed',
      type: 'unit',
      supertypes: ['champion'],
      tags: ['Master Yi', 'Ionia'],
      domains: ['body'],
      cost: { energy: 7, power: [{ kind: 'domain', domain: 'body' }] },
      might: 6,
    })
  })

  it('has Ganking and enters ready', () => {
    expect(card.keywords).toEqual(['ganking'])
    const start = mainPhase([{ id: 'yi', cardId: 'OGS-009', owner: 0, at: 'hand' }])
    const played = settle(act(start, { type: 'play-card', player: 0, card: 'yi' }))
    expect(played.objects.yi).toMatchObject({ zone: 'base', exhausted: false })
  })

  it('moves battlefield to battlefield, which a unit without Ganking cannot (144.4.c.1)', () => {
    const start = mainPhase([
      { id: 'yi', cardId: 'OGS-009', owner: 0, at: field('bf-0') },
      { id: 'plain', cardId: 'OGN-219', owner: 0, at: field('bf-0') },
      { id: 'home', cardId: 'OGN-219', owner: 0, at: base(0) },
    ])
    const moved = act(start, { type: 'move', player: 0, units: ['yi'], to: field('bf-1') })
    expect(moved.objects.yi?.location).toEqual(field('bf-1'))
    expect(() =>
      act(start, { type: 'move', player: 0, units: ['plain'], to: field('bf-1') }),
    ).toThrow(/refused/)
  })
})
