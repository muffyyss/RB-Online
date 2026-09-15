import { describe, expect, it } from 'vitest'

import card from '../src/sets/ogs/might-of-demacia-starter.js'
import { act, base, mainPhase, settle } from './support/game.js'

describe('OGS-023 Might of Demacia, Starter', () => {
  it('matches the printed card', () => {
    expect(card).toMatchObject({
      name: 'Might of Demacia',
      subtitle: 'Starter',
      type: 'legend',
      tags: ['Garen'],
    })
    expect([...card.domains].sort()).toEqual(['body', 'order'])
    expect(card.cost).toBeUndefined()
  })

  function conquerWith(count: number) {
    const units = Array.from({ length: count }, (_, i) => ({
      id: `u${String(i)}`,
      cardId: 'OGN-219', // Vanguard Sergeant
      owner: 0 as const,
      at: base(0),
    }))
    const start = mainPhase([
      { id: 'legend', cardId: 'OGS-023', owner: 0, at: 'legendZone' },
      ...units,
    ])
    return act(start, {
      type: 'move',
      player: 0,
      units: units.map((u) => u.id),
      to: { kind: 'battlefield', id: 'bf-0' },
    })
  }

  it('draws 2 on a conquer with 4 or more units there', () => {
    const moved = conquerWith(4)
    expect(moved.players[0].points).toBe(1)
    expect(settle(moved).players[0].hand).toHaveLength(2)
  })

  it('does nothing for a conquer with 3', () => {
    const moved = conquerWith(3)
    expect(moved.players[0].points).toBe(1)
    expect(moved.chain).toHaveLength(0)
    expect(moved.players[0].hand).toHaveLength(0)
  })
})
