import { describe, expect, it } from 'vitest'

import card from '../src/sets/ogs/annie-fiery.js'
import { expectRecordedButNotRunnable } from './support/recorded.js'

describe('OGS-001 Annie, Fiery', () => {
  it('matches the printed card', () => {
    expect(card).toMatchObject({
      name: 'Annie',
      subtitle: 'Fiery',
      type: 'unit',
      supertypes: ['champion'],
      tags: ['Annie', 'Noxus'],
      domains: ['fury'],
      cost: { energy: 5, power: [{ kind: 'domain', domain: 'fury' }] },
      might: 4,
    })
  })

  it('records Bonus Damage, marked as waiting on continuous effects', () => {
    expectRecordedButNotRunnable(card, 'annie-fiery-bonus-damage', { kind: 'passive' })
  })
})
