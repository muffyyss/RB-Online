import { describe, expect, it } from 'vitest'

import card from '../src/sets/ogs/garen-rugged.js'
import { attackInto } from './support/combat.js'
import { base, field, mainPhase } from './support/game.js'

describe('OGS-007 Garen, Rugged', () => {
  it('matches the printed card', () => {
    expect(card).toMatchObject({
      name: 'Garen',
      subtitle: 'Rugged',
      type: 'unit',
      supertypes: ['champion'],
      tags: ['Garen', 'Demacia', 'Elite'],
      domains: ['body'],
      cost: { energy: 6, power: [{ kind: 'domain', domain: 'body' }] },
      might: 5,
      keywords: [
        ['assault', 2],
        ['shield', 2],
      ],
    })
  })

  // Stormclaw Ursine: 6 Might. Against a plain 5 Might, Garen would lose.
  it('attacks as a 7 (Assault 2)', () => {
    const { state } = attackInto(
      mainPhase([
        { id: 'garen', cardId: 'OGS-007', owner: 0, at: base(0) },
        { id: 'bear', cardId: 'OGN-137', owner: 1, at: field('bf-0') },
      ]),
      ['garen'],
      'bf-0',
    )
    expect(state.objects.garen?.zone).toBe('battlefield')
    expect(state.objects.bear?.zone).toBe('trash')
  })

  it('defends as a 7 (Shield 2)', () => {
    const { state } = attackInto(
      mainPhase([
        { id: 'bear', cardId: 'OGN-137', owner: 0, at: base(0) },
        { id: 'garen', cardId: 'OGS-007', owner: 1, at: field('bf-0') },
      ]),
      ['bear'],
      'bf-0',
    )
    expect(state.objects.garen?.zone).toBe('battlefield')
    expect(state.objects.bear?.zone).toBe('trash')
  })
})
