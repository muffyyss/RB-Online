import { describe, expect, it } from 'vitest'

import card from '../src/sets/ogs/might-of-demacia-starter.js'
import { expectRecordedButNotRunnable } from './support/recorded.js'

describe('OGS-023 Might of Demacia, Starter', () => {
  it('matches the printed card', () => {
    expect(card).toMatchObject({
      name: 'Might of Demacia',
      subtitle: 'Starter',
      type: 'legend',
      tags: ['Garen'],
    })
    expect([...card.domains].sort()).toEqual(['body', 'order'])
    expect(card.cost).toBeUndefined()
  })

  it('draws 2 on conquer, marked as waiting on dispatch and the 4+ units condition', () => {
    expectRecordedButNotRunnable(card, 'might-of-demacia-draw', {
      kind: 'triggered',
      on: 'conquer',
      steps: [{ op: 'draw', amount: 2 }],
    })
  })
})
