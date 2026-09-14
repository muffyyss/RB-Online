import { describe, expect, it } from 'vitest'

import card from '../src/sets/ogs/decisive-strike.js'
import { expectRecordedButNotRunnable } from './support/recorded.js'

describe('OGS-024 Decisive Strike', () => {
  it('matches the printed card', () => {
    expect(card).toMatchObject({
      name: 'Decisive Strike',
      type: 'spell',
      supertypes: ['signature'],
      tags: ['Garen'],
      domains: ['body', 'order'],
      // One [C]: Body or Order pays it (135.2.e.6.c).
      cost: { energy: 5, power: [{ kind: 'self' }] },
      keywords: ['action'],
    })
  })

  it('records the team bonus, marked as waiting on this-turn Might', () => {
    expectRecordedButNotRunnable(card, 'decisive-strike-effect', { kind: 'spell', steps: [] })
  })
})
