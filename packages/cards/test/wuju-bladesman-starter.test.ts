import { describe, expect, it } from 'vitest'

import card from '../src/sets/ogs/wuju-bladesman-starter.js'
import { mightOf } from '@rb/engine'

import { act, base, field, mainPhase, oracle } from './support/game.js'

describe('OGS-019 Wuju Bladesman, Starter', () => {
  it('matches the printed card', () => {
    expect(card).toMatchObject({
      name: 'Wuju Bladesman',
      subtitle: 'Starter',
      type: 'legend',
      tags: ['Master Yi'],
    })
    expect([...card.domains].sort()).toEqual(['body', 'calm'])
    expect(card.cost).toBeUndefined()
  })

  /** Player 0 attacks bf-0, where player 1 (with Wuju Bladesman) defends. */
  const defending = (defenders: readonly string[]) =>
    act(
      mainPhase([
        { id: 'wuju', cardId: 'OGS-019', owner: 1, at: 'legendZone' },
        { id: 'attacker', cardId: 'OGN-219', owner: 0, at: base(0) },
        ...defenders.map((id) => ({
          id,
          cardId: 'OGN-219', // 4 Might
          owner: 1 as const,
          at: field('bf-0'),
        })),
      ]),
      { type: 'move', player: 0, units: ['attacker'], to: field('bf-0') },
    )
  const might = (state: ReturnType<typeof defending>, id: string) => {
    const object = state.objects[id]
    return object && mightOf(state, object, oracle)
  }

  it('gives a friendly unit defending alone +2 Might', () => {
    const state = defending(['guard'])
    expect(state.objects.guard?.combatRole).toBe('defender')
    expect(might(state, 'guard')).toBe(6)
    expect(might(state, 'attacker')).toBe(4) // not theirs, and not defending
  })

  it('gives nothing when two units defend together', () => {
    const state = defending(['guard-a', 'guard-b'])
    expect(might(state, 'guard-a')).toBe(4)
    expect(might(state, 'guard-b')).toBe(4)
  })
})
