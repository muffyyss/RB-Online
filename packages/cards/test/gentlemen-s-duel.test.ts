import { describe, expect, it } from 'vitest'

import card from '../src/sets/ogs/gentlemens-duel.js'
import { act, field, mainPhase, settle } from './support/game.js'

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

  const duel = (ally: string, enemy: string) => {
    const start = mainPhase([
      { id: 'duel', cardId: 'OGS-008', owner: 0, at: 'hand' },
      { id: 'ally', cardId: ally, owner: 0, at: field('bf-0') },
      { id: 'enemy', cardId: enemy, owner: 1, at: field('bf-1') },
    ])
    const offered: (readonly string[])[] = []
    const after = settle(act(start, { type: 'play-card', player: 0, card: 'duel' }), (c) => {
      offered.push(c)
      return c.slice(0, 1)
    })
    return { after, offered }
  }

  it('picks a friendly unit and an enemy unit as it is played (355.5)', () => {
    const { offered } = duel('OGN-219', 'OGN-137')
    expect(offered).toEqual([['ally'], ['enemy']])
  })

  it('gives +3 first, so a 4 Might unit beats a 6 Might one', () => {
    const { after } = duel('OGN-219', 'OGN-137') // 4 (+3 = 7) against Stormclaw Ursine, 6
    expect(after.objects.enemy?.zone).toBe('trash')
    expect(after.objects.ally).toMatchObject({ zone: 'battlefield', damage: 6, mightThisTurn: 3 })
  })

  it('deals both at once, so equal units both die', () => {
    const { after } = duel('OGN-013', 'OGN-049') // Pouty Poro 2 (+3 = 5) against a 5
    expect(after.objects.ally?.zone).toBe('trash')
    expect(after.objects.enemy?.zone).toBe('trash')
  })
})
