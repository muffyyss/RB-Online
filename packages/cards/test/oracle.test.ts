import { describe, expect, it } from 'vitest'

import { validateDeck } from '@rb/engine'

import { ALL_CARDS } from '../src/registry.js'
import { cardOracle, factsOf } from '../src/oracle.js'

describe('the card oracle', () => {
  it('knows every authored card, and nothing else', () => {
    const oracle = cardOracle()
    for (const card of ALL_CARDS) expect(oracle.facts(card.id)).toBeDefined()
    expect(oracle.facts('XXX-999')).toBeUndefined()
  })

  it('carries what deck validation needs, using the full name', () => {
    const lux = ALL_CARDS.find((card) => card.id === 'OGS-014')
    if (!lux) throw new Error('Lux missing')
    expect(factsOf(lux)).toMatchObject({
      type: 'unit',
      name: 'Lux, Crownguard',
      domains: ['order'],
      tags: ['Lux', 'Demacia'],
      supertypes: ['champion'],
      might: 2,
      cost: { energy: 4, power: [] },
    })
  })

  it('passes abilities through with their steps intact', () => {
    const lux = ALL_CARDS.find((card) => card.id === 'OGS-014')
    if (!lux) throw new Error('Lux missing')
    expect(factsOf(lux).abilities[0]).toEqual({
      id: 'lux-crownguard-ramp',
      kind: 'activated',
      exhaust: true,
      keywords: ['reaction'],
      steps: [{ op: 'add', energy: 2, onlyFor: ['spell'] }],
    })
  })

  it('lets the engine name unknown cards in a real deck', () => {
    const result = validateDeck(
      { legend: 'XXX-001', champion: 'OGS-014', main: [], runes: [], battlefields: [] },
      cardOracle(),
    )
    expect(result.valid).toBe(false)
    expect(result.errors.map((e) => e.code)).toContain('unknown-card')
  })
})
