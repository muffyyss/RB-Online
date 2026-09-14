import { describe, expect, it } from 'vitest'

import card from '../src/sets/ogs/master-yi-honed.js'
import { expectRecordedButNotRunnable } from './support/recorded.js'

describe('OGS-009 Master Yi, Honed', () => {
  it('matches the printed card', () => {
    expect(card).toMatchObject({
      name: 'Master Yi',
      subtitle: 'Honed',
      type: 'unit',
      supertypes: ['champion'],
      tags: ['Master Yi', 'Ionia'],
      domains: ['body'],
      cost: { energy: 7, power: [{ kind: 'domain', domain: 'body' }] },
      might: 6,
    })
  })

  it('records Ganking and entering ready, each marked as not yet implemented', () => {
    expectRecordedButNotRunnable(card, 'master-yi-honed-ganking', { kind: 'passive' })
    expectRecordedButNotRunnable(card, 'master-yi-honed-enter-ready', { kind: 'passive' })
  })
})
