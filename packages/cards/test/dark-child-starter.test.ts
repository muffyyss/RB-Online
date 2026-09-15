import { describe, expect, it } from 'vitest'

import card from '../src/sets/ogs/dark-child-starter.js'
import { act, base, mainPhase, settle } from './support/game.js'

describe('OGS-017 Dark Child, Starter', () => {
  it('matches the printed card', () => {
    expect(card.name).toBe('Dark Child')
    expect(card.subtitle).toBe('Starter')
    expect(card.type).toBe('legend')
    expect(card.tags).toEqual(['Annie'])
  })

  it('sets a Chaos/Fury Domain Identity (103.1.b)', () => {
    expect([...card.domains].sort()).toEqual(['chaos', 'fury'])
  })

  it('has no printed cost — legends are never played (133.6.b.1)', () => {
    expect(card.cost).toBeUndefined()
    expect(card.might).toBeUndefined()
  })

  it('readies 2 of its player’s exhausted runes at the end of their turn', () => {
    const start = mainPhase([
      { id: 'legend', cardId: 'OGS-017', owner: 0, at: 'legendZone' },
      { id: 'r1', cardId: 'OGN-007', owner: 0, at: base(0), exhausted: true },
      { id: 'r2', cardId: 'OGN-007', owner: 0, at: base(0), exhausted: true },
      { id: 'r3', cardId: 'OGN-166', owner: 0, at: base(0), exhausted: true },
      { id: 'ready', cardId: 'OGN-166', owner: 0, at: base(0) },
    ])
    const ending = act(start, { type: 'pass', player: 0 })
    expect(ending.step).toBe('ending')
    expect(ending.chain).toHaveLength(1)
    expect(ending.chain[0]).toMatchObject({ abilityId: 'dark-child-ready-runes', controller: 0 })

    const after = settle(ending)
    const readied = ['r1', 'r2', 'r3'].filter((id) => after.objects[id]?.exhausted === false)
    expect(readied).toHaveLength(2)
  })
})
