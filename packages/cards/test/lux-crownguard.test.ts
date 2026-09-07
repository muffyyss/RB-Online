import { describe, expect, it } from 'vitest'

import card from '../src/sets/ogs/lux-crownguard.js'

describe('OGS-014 Lux, Crownguard', () => {
  it('matches the printed card', () => {
    expect(card.name).toBe('Lux')
    expect(card.subtitle).toBe('Crownguard')
    expect(card.type).toBe('unit')
    expect(card.might).toBe(2)
    expect(card.cost).toEqual({ energy: 4, power: [] })
    expect(card.domains).toEqual(['order'])
  })

  it('is a Champion Unit tagged Lux and Demacia', () => {
    expect(card.supertypes).toContain('champion')
    expect(card.tags).toEqual(['Lux', 'Demacia'])
  })

  it('exhausts as a Reaction to add 2 Energy', () => {
    const ability = card.abilities?.find((a) => a.id === 'lux-crownguard-ramp')
    expect(ability).toMatchObject({
      kind: 'activated',
      exhaust: true,
      keywords: ['reaction'],
      steps: [{ op: 'add', energy: 2 }],
    })
  })

  it('is flagged as not fully modelled', () => {
    // "Use only to play spells" is a spending restriction the Rune Pool cannot
    // express yet. If this assertion starts failing, the restriction has been
    // implemented and the marker should be removed.
    const ability = card.abilities?.find((a) => a.id === 'lux-crownguard-ramp')
    expect(ability?.notImplemented).toBeTruthy()
  })
})
