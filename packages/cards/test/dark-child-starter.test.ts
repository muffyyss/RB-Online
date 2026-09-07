import { describe, expect, it } from 'vitest'

import card from '../src/sets/ogs/dark-child-starter.js'

describe('OGS-017 Dark Child, Starter', () => {
  it('matches the printed card', () => {
    expect(card.name).toBe('Dark Child')
    expect(card.subtitle).toBe('Starter')
    expect(card.type).toBe('legend')
    expect(card.tags).toEqual(['Annie'])
  })

  it('sets a Chaos/Fury Domain Identity (103.1.b)', () => {
    expect([...card.domains].sort()).toEqual(['chaos', 'fury'])
  })

  it('has no printed cost — legends are never played (133.6.b.1)', () => {
    expect(card.cost).toBeUndefined()
    expect(card.might).toBeUndefined()
  })

  it('readies 2 of its own runes at end of turn', () => {
    const ability = card.abilities?.find((a) => a.id === 'dark-child-ready-runes')
    expect(ability).toMatchObject({
      kind: 'triggered',
      on: 'end-of-turn',
      steps: [{ op: 'ready', target: { kind: 'rune', controller: 'self', count: 2 } }],
    })
  })
})
