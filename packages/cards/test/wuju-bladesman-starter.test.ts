import { describe, expect, it } from 'vitest'

import card from '../src/sets/ogs/wuju-bladesman-starter.js'
import { expectRecordedButNotRunnable } from './support/recorded.js'

describe('OGS-019 Wuju Bladesman, Starter', () => {
  it('matches the printed card', () => {
    expect(card).toMatchObject({
      name: 'Wuju Bladesman',
      subtitle: 'Starter',
      type: 'legend',
      tags: ['Master Yi'],
    })
    expect([...card.domains].sort()).toEqual(['body', 'calm'])
    expect(card.cost).toBeUndefined()
  })

  it('records the defends-alone bonus, marked as waiting on continuous effects', () => {
    expectRecordedButNotRunnable(card, 'wuju-bladesman-defends-alone', { kind: 'passive' })
  })
})
