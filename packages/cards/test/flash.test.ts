import { describe, expect, it } from 'vitest'

import card from '../src/sets/ogs/flash.js'
import { expectRecordedButNotRunnable } from './support/recorded.js'

describe('OGS-011 Flash', () => {
  it('matches the printed card', () => {
    expect(card).toMatchObject({
      name: 'Flash',
      type: 'spell',
      domains: ['chaos'],
      cost: { energy: 2, power: [] },
      keywords: ['reaction'],
    })
  })

  it('records the move effect, marked as waiting on the Move action', () => {
    expectRecordedButNotRunnable(card, 'flash-effect', { kind: 'spell', steps: [] })
  })
})
