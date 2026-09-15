import { describe, expect, it } from 'vitest'

import card from '../src/sets/ogs/flash.js'
import { act, base, field, mainPhase, settle } from './support/game.js'

describe('OGS-011 Flash', () => {
  it('matches the printed card', () => {
    expect(card).toMatchObject({
      name: 'Flash',
      type: 'spell',
      domains: ['chaos'],
      cost: { energy: 2, power: [] },
      keywords: ['reaction'],
    })
  })

  const scene = () => {
    const state = mainPhase([
      { id: 'flash', cardId: 'OGS-011', owner: 0, at: 'hand' },
      { id: 'a', cardId: 'OGN-219', owner: 0, at: field('bf-0') },
      { id: 'b', cardId: 'OGN-219', owner: 0, at: field('bf-1'), exhausted: true },
      { id: 'home', cardId: 'OGN-219', owner: 0, at: base(0) },
    ])
    // Player 0 holds bf-0 with a alone.
    return {
      ...state,
      battlefields: state.battlefields.map((bf) =>
        bf.id === 'bf-0' ? { ...bf, controller: 0 as const } : bf,
      ),
    }
  }

  it('moves up to two friendly units at battlefields to base, as ready or exhausted as they were', () => {
    let offered: readonly string[] = []
    let least = -1
    const played = act(scene(), { type: 'play-card', player: 0, card: 'flash' })
    const after = settle(played, (candidates, min) => {
      offered = candidates
      least = min
      return ['a', 'b']
    })
    expect([...offered].sort()).toEqual(['a', 'b'])
    expect(least).toBe(0) // "up to"
    expect(after.objects.a).toMatchObject({ zone: 'base', location: base(0), exhausted: false })
    expect(after.objects.b).toMatchObject({ zone: 'base', location: base(0), exhausted: true })
  })

  it('is followed by a Cleanup: a battlefield left empty loses its controller (190.4.c)', () => {
    const played = act(scene(), { type: 'play-card', player: 0, card: 'flash' })
    const after = settle(played, () => ['a'])
    expect(after.battlefields.find((bf) => bf.id === 'bf-0')?.controller).toBeUndefined()
  })
})
