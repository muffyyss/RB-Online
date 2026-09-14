import { describe, expect, it } from 'vitest'

import card from '../src/sets/ogs/master-yi-meditative.js'
import { expectRecordedButNotRunnable } from './support/recorded.js'

describe('OGS-004 Master Yi, Meditative', () => {
  it('matches the printed card', () => {
    expect(card).toMatchObject({
      name: 'Master Yi',
      subtitle: 'Meditative',
      type: 'unit',
      supertypes: ['champion'],
      tags: ['Master Yi', 'Ionia'],
      domains: ['calm'],
      cost: { energy: 5, power: [{ kind: 'domain', domain: 'calm' }] },
      might: 4,
    })
  })

  it('records the 8+ runes bonus, marked as waiting on continuous effects', () => {
    expectRecordedButNotRunnable(card, 'master-yi-meditative-eight-runes', { kind: 'passive' })
  })
})
