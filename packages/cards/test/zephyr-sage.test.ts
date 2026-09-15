import { describe, expect, it } from 'vitest'

import card from '../src/sets/ogs/zephyr-sage.js'
import { attackInto } from './support/combat.js'
import { base, field, mainPhase } from './support/game.js'

describe('OGS-005 Zephyr Sage', () => {
  it('matches the printed card', () => {
    expect(card).toMatchObject({
      name: 'Zephyr Sage',
      type: 'unit',
      tags: ['Ionia', 'Bird'],
      domains: ['calm'],
      cost: { energy: 6, power: [{ kind: 'domain', domain: 'calm' }] },
      might: 6,
      keywords: ['shield'],
    })
    expect(card.supertypes).toBeUndefined()
  })

  // Stormclaw Ursine is also 6 Might.
  it('defends as a 7 (Shield), surviving an equal attacker', () => {
    const { state } = attackInto(
      mainPhase([
        { id: 'bear', cardId: 'OGN-137', owner: 0, at: base(0) },
        { id: 'sage', cardId: 'OGS-005', owner: 1, at: field('bf-0') },
      ]),
      ['bear'],
      'bf-0',
    )
    expect(state.objects.sage?.zone).toBe('battlefield')
    expect(state.objects.bear?.zone).toBe('trash')
  })

  it('gets nothing from Shield when attacking', () => {
    const { state } = attackInto(
      mainPhase([
        { id: 'sage', cardId: 'OGS-005', owner: 0, at: base(0) },
        { id: 'bear', cardId: 'OGN-137', owner: 1, at: field('bf-0') },
      ]),
      ['sage'],
      'bf-0',
    )
    expect(state.objects.sage?.zone).toBe('trash')
    expect(state.objects.bear?.zone).toBe('trash')
  })
})
