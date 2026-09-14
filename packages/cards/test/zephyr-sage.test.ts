import { describe, expect, it } from 'vitest'

import card from '../src/sets/ogs/zephyr-sage.js'
import { expectRecordedButNotRunnable } from './support/recorded.js'

describe('OGS-005 Zephyr Sage', () => {
  it('matches the printed card', () => {
    expect(card).toMatchObject({
      name: 'Zephyr Sage',
      type: 'unit',
      tags: ['Ionia', 'Bird'],
      domains: ['calm'],
      cost: { energy: 6, power: [{ kind: 'domain', domain: 'calm' }] },
      might: 6,
    })
    expect(card.supertypes).toBeUndefined()
  })

  it('records Shield, marked as waiting on the keyword', () => {
    expectRecordedButNotRunnable(card, 'zephyr-sage-shield', { kind: 'passive' })
  })
})
