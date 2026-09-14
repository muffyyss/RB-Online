import { describe, expect, it } from 'vitest'

import card from '../src/sets/ogs/annie-stubborn.js'
import { expectRecordedButNotRunnable } from './support/recorded.js'

describe('OGS-010 Annie, Stubborn', () => {
  it('matches the printed card', () => {
    expect(card).toMatchObject({
      name: 'Annie',
      subtitle: 'Stubborn',
      type: 'unit',
      supertypes: ['champion'],
      tags: ['Annie', 'Noxus'],
      domains: ['chaos'],
      cost: { energy: 4, power: [{ kind: 'domain', domain: 'chaos' }] },
      might: 3,
    })
  })

  it('triggers on being played, not merely entering the board', () => {
    expectRecordedButNotRunnable(card, 'annie-stubborn-return-spell', {
      kind: 'triggered',
      on: 'played',
    })
  })
})
