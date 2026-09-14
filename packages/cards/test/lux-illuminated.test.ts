import { describe, expect, it } from 'vitest'

import card from '../src/sets/ogs/lux-illuminated.js'
import { expectRecordedButNotRunnable } from './support/recorded.js'

describe('OGS-006 Lux, Illuminated', () => {
  it('matches the printed card', () => {
    expect(card).toMatchObject({
      name: 'Lux',
      subtitle: 'Illuminated',
      type: 'unit',
      supertypes: ['champion'],
      tags: ['Lux', 'Demacia'],
      domains: ['mind'],
      cost: { energy: 6, power: [{ kind: 'domain', domain: 'mind' }] },
      might: 5,
    })
  })

  it('records the spell trigger, marked as not yet runnable', () => {
    expectRecordedButNotRunnable(card, 'lux-illuminated-empowered', {
      kind: 'triggered',
      on: 'spell-played',
      steps: [],
    })
  })
})
