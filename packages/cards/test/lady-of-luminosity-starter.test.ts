import { describe, expect, it } from 'vitest'

import card from '../src/sets/ogs/lady-of-luminosity-starter.js'
import { act, mainPhase, settle } from './support/game.js'

describe('OGS-021 Lady of Luminosity, Starter', () => {
  it('matches the printed card', () => {
    expect(card).toMatchObject({
      name: 'Lady of Luminosity',
      subtitle: 'Starter',
      type: 'legend',
      tags: ['Lux'],
    })
    expect([...card.domains].sort()).toEqual(['mind', 'order'])
    expect(card.cost).toBeUndefined()
  })

  const scene = (spell: string) =>
    mainPhase([
      { id: 'legend', cardId: 'OGS-021', owner: 0, at: 'legendZone' },
      { id: 'spell', cardId: spell, owner: 0, at: 'hand' },
    ])

  it('draws 1 when its player plays a spell that costs 5 or more', () => {
    const before = scene('OGN-085') // Falling Comet, 5 Energy
    const played = act(before, { type: 'play-card', player: 0, card: 'spell' })
    expect(played.chain.map((c) => c.abilityId ?? 'spell')).toEqual([
      'spell',
      'lady-of-luminosity-draw',
    ])
    const after = settle(played)
    expect(after.players[0].hand).toHaveLength(1)
  })

  it('does not trigger for a cheaper spell', () => {
    const played = act(scene('OGS-003'), { type: 'play-card', player: 0, card: 'spell' }) // Incinerate, 2
    expect(played.chain.some((c) => c.abilityId === 'lady-of-luminosity-draw')).toBe(false)
  })
})
