import { describe, expect, it } from 'vitest'

import card from '../src/sets/ogs/lady-of-luminosity-starter.js'
import { expectRecordedButNotRunnable } from './support/recorded.js'

describe('OGS-021 Lady of Luminosity, Starter', () => {
  it('matches the printed card', () => {
    expect(card).toMatchObject({
      name: 'Lady of Luminosity',
      subtitle: 'Starter',
      type: 'legend',
      tags: ['Lux'],
    })
    expect([...card.domains].sort()).toEqual(['mind', 'order'])
    expect(card.cost).toBeUndefined()
  })

  it('draws 1 when a spell is played, marked as waiting on dispatch and the cost condition', () => {
    expectRecordedButNotRunnable(card, 'lady-of-luminosity-draw', {
      kind: 'triggered',
      on: 'spell-played',
      steps: [{ op: 'draw', amount: 1 }],
    })
  })
})
