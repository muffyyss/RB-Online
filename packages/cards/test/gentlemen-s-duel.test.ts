import { describe, expect, it } from 'vitest'

import card from '../src/sets/ogs/gentlemens-duel.js'
import { expectRecordedButNotRunnable } from './support/recorded.js'

describe("OGS-008 Gentlemen's Duel", () => {
  it('matches the printed card', () => {
    expect(card).toMatchObject({
      name: "Gentlemen's Duel",
      type: 'spell',
      domains: ['body'],
      cost: { energy: 6, power: [{ kind: 'domain', domain: 'body' }] },
      keywords: ['action'],
    })
  })

  it('records the duel, marked as waiting on this-turn Might and mutual damage', () => {
    expectRecordedButNotRunnable(card, 'gentlemens-duel-effect', { kind: 'spell', steps: [] })
  })
})
