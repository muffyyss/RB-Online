import { describe, expect, it } from 'vitest'

import card from '../src/sets/ogs/incinerate.js'
import { act, field, mainPhase, settle } from './support/game.js'

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

describe('OGS-003 Incinerate in play', () => {
  it("goes to its owner's trash after resolving, even though it paused for a target (133.4.b.1)", () => {
    const start = mainPhase([
      { id: 'spell', cardId: 'OGS-003', owner: 0, at: 'hand' },
      { id: 'foe', cardId: 'OGN-219', owner: 1, at: field('bf-0') },
    ])
    const after = settle(act(start, { type: 'play-card', player: 0, card: 'spell' }))
    expect(after.objects.foe?.damage).toBeGreaterThan(0)
    expect(after.objects.spell?.zone).toBe('trash')
    expect(after.players[0].trash).toEqual(['spell'])
    expect(after.players[0].hand).toEqual([])
  })
})
