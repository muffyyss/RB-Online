import { describe, expect, it } from 'vitest'

import { advanceFlow, mightOf } from '@rb/engine'
import type { GameState } from '@rb/engine'

import { getCard } from '../src/registry.js'
import { act, base, field, mainPhase, oracle, settle } from './support/game.js'

/**
 * The twelve Legends of Origins (107.4).
 *
 * A Legend is what a deck is built around: it sets the Domain Identity
 * (103.1.b), never leaves the Legend Zone (107.4.d), and its ability is
 * available from turn one. The six whose text the DSL can express are played
 * here through `applyAction`; the rest carry `notImplemented` and say why.
 *
 * [id, name, champion tag, domains]
 */
const PRINTED: [string, string, string, string[]][] = [
  ['OGN-247', 'Daughter of the Void', 'Kai’Sa', ['fury', 'mind']],
  ['OGN-249', 'Relentless Storm', 'Volibear', ['body', 'fury']],
  ['OGN-251', 'Loose Cannon', 'Jinx', ['chaos', 'fury']],
  ['OGN-253', 'Hand of Noxus', 'Darius', ['fury', 'order']],
  ['OGN-255', 'Nine-Tailed Fox', 'Ahri', ['calm', 'mind']],
  ['OGN-257', 'Blind Monk', 'Lee Sin', ['body', 'calm']],
  ['OGN-259', 'Unforgiven', 'Yasuo', ['calm', 'chaos']],
  ['OGN-261', 'Radiant Dawn', 'Leona', ['calm', 'order']],
  ['OGN-263', 'Swift Scout', 'Teemo', ['chaos', 'mind']],
  ['OGN-265', 'Herald of the Arcane', 'Viktor', ['mind', 'order']],
  ['OGN-267', 'Bounty Hunter', 'Miss Fortune', ['body', 'chaos']],
  ['OGN-269', 'The Boss', 'Sett', ['body', 'order']],
]

describe('the Legends of Origins', () => {
  it.each(PRINTED)('%s %s is printed as it is on the card', (id, name, tag, domains) => {
    const card = getCard(id)
    expect(card?.name).toBe(name)
    expect(card?.type).toBe('legend')
    expect(card?.tags).toEqual([tag])
    expect([...(card?.domains ?? [])].sort()).toEqual([...domains].sort())
    // A Legend has no cost and no Might: it is never played (133.6.b.1).
    expect(card?.cost).toBeUndefined()
    expect(card?.might).toBeUndefined()
    expect(card?.text?.length ?? 0).toBeGreaterThan(0)
  })

  it('covers every Legend in the set once', () => {
    expect(PRINTED).toHaveLength(12)
    expect(new Set(PRINTED.map(([id]) => id)).size).toBe(12)
  })
})

/** Player 0's Main Phase with `card` in their Legend Zone. */
function withLegend(card: string, specs: Parameters<typeof mainPhase>[0] = []): GameState {
  return mainPhase([{ id: 'legend', cardId: card, owner: 0, at: 'legendZone' }, ...specs])
}

const use = (state: GameState, abilityId: string): GameState =>
  settle(act(state, { type: 'activate-ability', player: 0, source: 'legend', abilityId }))

describe('Legend abilities that run', () => {
  it('OGN-247 Daughter of the Void adds Power that only spells may spend', () => {
    const start = withLegend('OGN-247')
    // An empty pool, so what the ability adds is all there is to see.
    const empty: GameState = {
      ...start,
      players: {
        ...start.players,
        0: {
          ...start.players[0],
          runePool: { energy: 0, power: {}, universal: 0, restricted: [] },
        },
      },
    }
    const after = use(empty, 'daughter-of-the-void-power')
    expect(after.objects.legend?.exhausted).toBe(true)
    expect(after.players[0].runePool.restricted).toEqual([
      { energy: 0, power: {}, universal: 1, onlyFor: ['spell'] },
    ])
  })

  it('OGN-251 Loose Cannon draws on an empty hand, and not on a full one', () => {
    const handOf = (cards: number): GameState => {
      const start = withLegend(
        'OGN-251',
        Array.from({ length: cards }, (_, i) => ({
          id: `card-${String(i)}`,
          cardId: 'OGN-219',
          owner: 0 as const,
          at: 'hand' as const,
        })),
      )
      // The Beginning Step is where "at the start of your turn" fires (315.2.a).
      return {
        ...start,
        phase: 'beginning',
        step: 'beginning',
        stepTaskDone: false,
        priority: null,
      }
    }
    const drawn = (cards: number) => {
      const before = handOf(cards)
      const after = settle(advanceFlow(before, oracle).state)
      return after.players[0].hand.length - before.players[0].hand.length
    }
    // The turn's own Draw Step gives one card either way; the Cannon adds a second.
    expect(drawn(1)).toBe(drawn(3) + 1)
  })

  it('OGN-257 Blind Monk buffs a friendly unit for [1] and an exhaust', () => {
    const start = withLegend('OGN-257', [
      { id: 'ally', cardId: 'OGN-219', owner: 0, at: base(0) },
      { id: 'foe', cardId: 'OGN-219', owner: 1, at: base(1) },
    ])
    const after = use(start, 'blind-monk-buff')
    expect(after.objects.ally?.buffs).toBe(1)
    expect(after.objects.foe?.buffs).toBe(0)
    expect(after.objects.legend?.exhausted).toBe(true)
    expect(after.players[0].runePool.energy).toBe(start.players[0].runePool.energy - 1)
  })

  it('OGN-265 Herald of the Arcane plays a Recruit token in your base', () => {
    const after = use(withLegend('OGN-265'), 'herald-of-the-arcane-recruit')
    const recruits = Object.values(after.objects).filter((object) => object.cardId === 'TOK-001')
    expect(recruits).toHaveLength(1)
    expect(recruits[0]).toMatchObject({ controller: 0, zone: 'base' })
    const token = recruits[0]
    expect(token && mightOf(after, token, oracle)).toBe(1)
  })

  it('OGN-267 Bounty Hunter gives Ganking for the turn, and it expires', () => {
    const start = withLegend('OGN-267', [
      { id: 'roamer', cardId: 'OGN-219', owner: 0, at: field('bf-0') },
    ])
    const after = use(start, 'bounty-hunter-ganking')
    expect(after.objects.roamer?.keywordsThisTurn).toEqual({ ganking: 1 })
    // Ganking is what lets a unit cross from Battlefield to Battlefield (144.4.c.1).
    const canGank = (state: GameState) =>
      state.objects.roamer !== undefined &&
      applyMoveIsLegal(state, 'roamer', 'bf-1') &&
      state.objects.roamer.location?.kind === 'battlefield'
    expect(canGank(after)).toBe(true)

    // Pass the turn: the Expiration Step sweeps it up (317.2.c).
    const nextTurn = act(after, { type: 'pass', player: 0 })
    expect(nextTurn.objects.roamer?.keywordsThisTurn).toBeUndefined()
  })

  it('OGN-269 The Boss readies itself when you conquer', () => {
    const start = withLegend('OGN-269', [
      { id: 'raider', cardId: 'OGN-219', owner: 0, at: base(0) },
    ])
    const exhausted: GameState = {
      ...start,
      objects: {
        ...start.objects,
        legend: { ...(start.objects.legend as GameState['objects'][string]), exhausted: true },
      },
    }
    const after = settle(
      act(exhausted, { type: 'move', player: 0, units: ['raider'], to: field('bf-0') }),
    )
    expect(after.battlefields.find((bf) => bf.id === 'bf-0')?.controller).toBe(0)
    expect(after.objects.legend?.exhausted).toBe(false)
  })
})

/** Would this Standard Move be accepted? Asked without changing the state. */
function applyMoveIsLegal(state: GameState, unit: string, to: 'bf-0' | 'bf-1'): boolean {
  try {
    act(state, { type: 'move', player: 0, units: [unit], to: field(to) })
    return true
  } catch {
    return false
  }
}
