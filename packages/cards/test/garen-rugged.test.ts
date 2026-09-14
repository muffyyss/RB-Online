import { describe, expect, it } from 'vitest'

import card from '../src/sets/ogs/garen-rugged.js'
import { expectRecordedButNotRunnable } from './support/recorded.js'

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
    })
  })

  it('records Assault 2 and Shield 2, each marked as not yet implemented', () => {
    expectRecordedButNotRunnable(card, 'garen-rugged-assault', { kind: 'passive' })
    expectRecordedButNotRunnable(card, 'garen-rugged-shield', { kind: 'passive' })
  })
})
