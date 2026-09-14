import { describe, expect, it } from 'vitest'

import card from '../src/sets/ogs/highlander.js'
import { expectRecordedButNotRunnable } from './support/recorded.js'

describe('OGS-020 Highlander', () => {
  it('matches the printed card', () => {
    expect(card).toMatchObject({
      name: 'Highlander',
      type: 'spell',
      supertypes: ['signature'],
      tags: ['Master Yi'],
      domains: ['body', 'calm'],
      cost: { energy: 4, power: [] },
      keywords: ['reaction'],
    })
  })

  it('records the recall, marked as waiting on replacement effects', () => {
    expectRecordedButNotRunnable(card, 'highlander-effect', { kind: 'spell', steps: [] })
  })
})
