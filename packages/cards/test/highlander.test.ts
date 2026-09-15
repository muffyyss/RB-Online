import { describe, expect, it } from 'vitest'

import card from '../src/sets/ogs/highlander.js'
import { act, base, field, mainPhase, settle } from './support/game.js'
import { fightOut } from './support/combat.js'

describe('OGS-020 Highlander', () => {
  it('matches the printed card', () => {
    expect(card).toMatchObject({
      name: 'Highlander',
      type: 'spell',
      supertypes: ['signature'],
      tags: ['Master Yi'],
      domains: ['body', 'calm'],
      cost: { energy: 4, power: [] },
      keywords: ['reaction'],
    })
  })

  it('recalls a unit that would die in combat, exhausted, and the Combat Cleanup heals it', () => {
    const start = mainPhase([
      { id: 'hero', cardId: 'OGN-219', owner: 0, at: base(0) }, // 4 Might
      { id: 'highlander', cardId: 'OGS-020', owner: 0, at: 'hand' },
      { id: 'mech', cardId: 'OGN-088', owner: 1, at: field('bf-0') }, // 8 Might
    ])
    const fighting = act(start, { type: 'move', player: 0, units: ['hero'], to: field('bf-0') })
    const saved = settle(
      act(fighting, { type: 'play-card', player: 0, card: 'highlander' }),
      () => ['hero'],
    )
    expect(saved.objects.hero?.recallInsteadOfDying).toBe(true)

    const after = fightOut(saved)
    expect(after.objects.hero).toMatchObject({
      zone: 'base',
      location: base(0),
      exhausted: true,
      damage: 0,
    })
    expect(after.players[0].trash).not.toContain('hero')
    expect(after.objects.hero?.recallInsteadOfDying).toBeUndefined() // used up
  })

  it('replaces only the next death', () => {
    const start = mainPhase([
      { id: 'hero', cardId: 'OGN-219', owner: 0, at: field('bf-0') },
      { id: 'highlander', cardId: 'OGS-020', owner: 0, at: 'hand' },
      { id: 'blast', cardId: 'OGS-012', owner: 0, at: 'hand' }, // Kill a unit at a battlefield
    ])
    const protectedHero = settle(
      act(start, { type: 'play-card', player: 0, card: 'highlander' }),
      () => ['hero'],
    )
    const first = settle(
      act(protectedHero, { type: 'play-card', player: 0, card: 'blast' }),
      () => ['hero'],
    )
    expect(first.objects.hero).toMatchObject({ zone: 'base', exhausted: true })

    // Used up: a second death would not be replaced (370.2).
    expect(first.objects.hero?.recallInsteadOfDying).toBeUndefined()
  })
})
