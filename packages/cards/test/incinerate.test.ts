import { describe, expect, it } from 'vitest'

import card from '../src/sets/ogs/incinerate.js'

describe('OGS-003 Incinerate', () => {
  it('matches the printed card', () => {
    expect(card.name).toBe('Incinerate')
    expect(card.type).toBe('spell')
    expect(card.domains).toEqual(['fury'])
    expect(card.cost).toEqual({ energy: 2, power: [] })
  })

  it('has Action, so it can be played during a showdown (308.1.a)', () => {
    expect(card.keywords).toContain('action')
  })

  it('deals 2 to a chosen unit at a battlefield', () => {
    const effect = card.abilities?.find((a) => a.kind === 'spell')
    expect(effect).toBeDefined()
    expect(effect?.steps).toEqual([
      { op: 'choose', as: '$victim', from: { kind: 'unit', at: 'any-battlefield' } },
      { op: 'deal', amount: 2, target: '$victim' },
    ])
  })

  it('targets a unit at a battlefield, not one in a base', () => {
    // The printed text says "a unit at a battlefield" - a unit sitting in a
    // player's Base is not a legal target.
    const effect = card.abilities?.find((a) => a.kind === 'spell')
    const choose = effect?.steps[0]
    expect(choose).toMatchObject({ op: 'choose', from: { at: 'any-battlefield' } })
  })
})
