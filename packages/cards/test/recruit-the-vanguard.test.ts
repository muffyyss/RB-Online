import { describe, expect, it } from 'vitest'

import type { GameState } from '@rb/engine'

import card from '../src/sets/ogs/recruit-the-vanguard.js'
import { act, base, field, mainPhase, settle } from './support/game.js'

describe('OGS-015 Recruit the Vanguard', () => {
  it('matches the printed card', () => {
    expect(card).toMatchObject({
      name: 'Recruit the Vanguard',
      type: 'spell',
      domains: ['order'],
      cost: { energy: 6, power: [] },
      keywords: ['action'],
    })
  })

  const tokens = (state: GameState) =>
    Object.values(state.objects).filter((object) => object.cardId === 'TOK-001')

  it('plays four 1 Might Recruit tokens to base when its player controls no battlefield', () => {
    const start = mainPhase([{ id: 'spell', cardId: 'OGS-015', owner: 0, at: 'hand' }])
    let asked = 0
    const after = settle(act(start, { type: 'play-card', player: 0, card: 'spell' }), (c) => {
      asked += 1
      return c
    })
    expect(asked).toBe(0) // nowhere else to put them, so nothing to ask
    const played = tokens(after)
    expect(played).toHaveLength(4)
    for (const token of played) {
      expect(token).toMatchObject({
        owner: 0,
        controller: 0,
        zone: 'base',
        location: base(0),
        exhausted: true, // units enter exhausted (143.4), tokens included (185.2.d)
        token: true,
      })
    }
  })

  it('asks for each token whether it goes to a battlefield its player controls', () => {
    const start = mainPhase([
      { id: 'spell', cardId: 'OGS-015', owner: 0, at: 'hand' },
      { id: 'holder', cardId: 'OGN-219', owner: 0, at: field('bf-0') },
      { id: 'theirs', cardId: 'OGN-219', owner: 1, at: field('bf-1') },
    ])
    const held: GameState = {
      ...start,
      battlefields: start.battlefields.map((bf) => ({
        ...bf,
        controller: bf.id === 'bf-0' ? (0 as const) : (1 as const),
      })),
    }
    const offered: (readonly string[])[] = []
    const answers = [['bf-0'], [], ['bf-0'], []]
    const after = settle(act(held, { type: 'play-card', player: 0, card: 'spell' }), (c) => {
      offered.push(c)
      return answers[offered.length - 1] ?? []
    })
    expect(offered).toEqual([['bf-0'], ['bf-0'], ['bf-0'], ['bf-0']]) // never theirs
    const at = tokens(after).map((t) =>
      t.location?.kind === 'battlefield' ? t.location.id : 'base',
    )
    expect(at.sort()).toEqual(['base', 'base', 'bf-0', 'bf-0'])
  })
})
