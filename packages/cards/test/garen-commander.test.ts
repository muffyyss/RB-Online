import { describe, expect, it } from 'vitest'

import card from '../src/sets/ogs/garen-commander.js'
import { expectRecordedButNotRunnable } from './support/recorded.js'

describe('OGS-013 Garen, Commander', () => {
  it('matches the printed card', () => {
    expect(card).toMatchObject({
      name: 'Garen',
      subtitle: 'Commander',
      type: 'unit',
      supertypes: ['champion'],
      tags: ['Garen', 'Demacia', 'Elite'],
      domains: ['order'],
      cost: { energy: 6, power: [{ kind: 'domain', domain: 'order' }] },
      might: 5,
    })
  })

  it('records the aura, marked as waiting on continuous effects', () => {
    expectRecordedButNotRunnable(card, 'garen-commander-aura', { kind: 'passive' })
  })
})
