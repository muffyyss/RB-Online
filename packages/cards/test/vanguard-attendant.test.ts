import { describe, expect, it } from 'vitest'

import card from '../src/sets/ogs/vanguard-attendant.js'
import { expectRecordedButNotRunnable } from './support/recorded.js'

describe('OGS-016 Vanguard Attendant', () => {
  it('matches the printed card', () => {
    expect(card).toMatchObject({
      name: 'Vanguard Attendant',
      type: 'unit',
      tags: ['Demacia', 'Elite'],
      domains: ['order'],
      cost: { energy: 6, power: [{ kind: 'domain', domain: 'order' }] },
      might: 5,
    })
    expect(card.supertypes).toBeUndefined()
  })

  it('records entering ready, marked as not yet implemented', () => {
    expectRecordedButNotRunnable(card, 'vanguard-attendant-enter-ready', { kind: 'passive' })
  })
})
