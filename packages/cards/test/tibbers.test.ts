import { describe, expect, it } from 'vitest'

import { beginExecution } from '@rb/engine'

import card from '../src/sets/ogs/tibbers.js'
import { board, testOracle } from './support/play.js'
import { expectRecordedButNotRunnable } from './support/recorded.js'

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

  it('records its play trigger, marked as waiting on trigger dispatch', () => {
    expectRecordedButNotRunnable(card, 'tibbers-bear-hug', { kind: 'triggered', on: 'played' })
  })

  it('has steps that already hit every unit at every battlefield, and none in bases', () => {
    // The trigger does not fire yet, but its steps are exact: run them directly
    // so they are known to be right when dispatch arrives.
    const ability = card.abilities?.find((a) => a.id === 'tibbers-bear-hug')
    const scene = board([
      { id: 'enemy', cardId: 'OGS-001', owner: 1, at: 'bf-0' },
      { id: 'mine', cardId: 'OGS-014', owner: 0, at: 'bf-1' },
      { id: 'safe', cardId: 'OGS-014', owner: 1, at: 'base' },
    ])
    const result = beginExecution(
      scene,
      { source: 'mine', controller: 0, steps: ability && 'steps' in ability ? ability.steps : [] },
      testOracle,
    )
    expect(result.state.objects.enemy?.damage).toBe(3)
    expect(result.state.objects.mine?.zone).toBe('trash') // friendly fire: all units
    expect(result.state.objects.safe?.damage).toBe(0)
  })
})
