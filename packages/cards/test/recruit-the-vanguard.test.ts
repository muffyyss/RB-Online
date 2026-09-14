import { describe, expect, it } from 'vitest'

import card from '../src/sets/ogs/recruit-the-vanguard.js'
import { expectRecordedButNotRunnable } from './support/recorded.js'

describe('OGS-015 Recruit the Vanguard', () => {
  it('matches the printed card', () => {
    expect(card).toMatchObject({
      name: 'Recruit the Vanguard',
      type: 'spell',
      domains: ['order'],
      cost: { energy: 6, power: [] },
      keywords: ['action'],
    })
  })

  it('records the token effect, marked as waiting on token creation', () => {
    expectRecordedButNotRunnable(card, 'recruit-the-vanguard-effect', { kind: 'spell', steps: [] })
  })
})
