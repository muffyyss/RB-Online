import { describe, expect, it } from 'vitest'

import { applyAction, legalActions } from '../src/actions/index.js'
import { oracleFrom } from '../src/effects/oracle.js'
import { RUNES_PER_TURN, VICTORY_SCORE, advanceFlow, score } from '../src/flow/phases.js'
import type { GameEvent } from '../src/effects/events.js'
import type { GameState } from '../src/state/game-state.js'
import { makeState } from './support/state.js'

const oracle = oracleFrom({
  'unit-3': {
    type: 'unit',
    name: 'Unit',
    domains: ['fury'],
    tags: [],
    might: 3,
    keywords: [],
    abilities: [],
  },
  rune: { type: 'rune', name: 'Rune', domains: ['fury'], tags: [], keywords: [], abilities: [] },
  card: { type: 'spell', name: 'Card', domains: ['fury'], tags: [], keywords: [], abilities: [] },
})

/** A state parked at the start of a turn, with decks to draw and channel from. */
function atTurnStart(overrides: Partial<GameState> = {}): GameState {
  return makeState(
    [
      { id: 'r1', cardId: 'rune', owner: 0, zone: 'runeDeck' },
      { id: 'r2', cardId: 'rune', owner: 0, zone: 'runeDeck' },
      { id: 'r3', cardId: 'rune', owner: 0, zone: 'runeDeck' },
      { id: 'r4', cardId: 'rune', owner: 1, zone: 'runeDeck' },
      { id: 'r5', cardId: 'rune', owner: 1, zone: 'runeDeck' },
      { id: 'r6', cardId: 'rune', owner: 1, zone: 'runeDeck' },
      { id: 'd1', cardId: 'card', owner: 0, zone: 'mainDeck' },
      { id: 'd2', cardId: 'card', owner: 0, zone: 'mainDeck' },
      { id: 'd3', cardId: 'card', owner: 1, zone: 'mainDeck' },
      { id: 'd4', cardId: 'card', owner: 1, zone: 'mainDeck' },
    ],
    { phase: 'awaken', step: 'ready', priority: null, ...overrides },
  )
}

describe('turn machine — start of turn (315)', () => {
  it('runs every step and stops in the Main Phase with the Turn Player holding priority', () => {
    const { state } = advanceFlow(atTurnStart())
    expect(state.phase).toBe('main')
    expect(state.step).toBe('main')
    expect(state.priority).toBe(state.turnPlayer)
  })

  it('readies the Turn Player exhausted objects, and only theirs (315.1.b)', () => {
    const start = atTurnStart()
    const withExhausted: GameState = {
      ...start,
      objects: {
        ...start.objects,
        mine: {
          id: 'mine',
          cardId: 'unit-3',
          owner: 0,
          controller: 0,
          zone: 'base',
          exhausted: true,
          damage: 0,
          buffs: 0,
          faceDown: false,
        },
        theirs: {
          id: 'theirs',
          cardId: 'unit-3',
          owner: 1,
          controller: 1,
          zone: 'base',
          exhausted: true,
          damage: 0,
          buffs: 0,
          faceDown: false,
        },
      },
    }
    const { state } = advanceFlow(withExhausted)
    expect(state.objects.mine?.exhausted).toBe(false)
    expect(state.objects.theirs?.exhausted).toBe(true)
  })

  it('channels 2 runes, readied, into the base (315.3, 430.2.a)', () => {
    const { state } = advanceFlow(atTurnStart())
    expect(state.players[0].base).toHaveLength(RUNES_PER_TURN)
    expect(state.players[0].runeDeck).toHaveLength(3 - RUNES_PER_TURN)
    for (const id of state.players[0].base) {
      expect(state.objects[id]?.exhausted).toBe(false)
      expect(state.objects[id]?.zone).toBe('base')
    }
  })

  it('gives the second player an extra rune on their first Channel Phase (485.7)', () => {
    const secondPlayerTurn = atTurnStart({ turnPlayer: 1, turnNumber: 2 })
    const { state } = advanceFlow(secondPlayerTurn)
    expect(state.players[1].base).toHaveLength(RUNES_PER_TURN + 1)
  })

  it('draws exactly one card (315.4)', () => {
    const { state } = advanceFlow(atTurnStart())
    expect(state.players[0].hand).toHaveLength(1)
    expect(state.players[0].mainDeck).toHaveLength(1)
  })

  it('empties the Rune Pool at the START of Main, after channelling (167, 316.3)', () => {
    // Easy to get wrong: the pool empties entering Main, not at end of turn
    // only, so resources added during the start of turn do not survive.
    const start: GameState = {
      ...atTurnStart(),
      players: {
        ...atTurnStart().players,
        0: {
          ...atTurnStart().players[0],
          runePool: { energy: 5, power: { fury: 2 }, universal: 1, restricted: [] },
        },
      },
    }
    const { state } = advanceFlow(start)
    expect(state.players[0].runePool).toEqual({
      energy: 0,
      power: {},
      universal: 0,
      restricted: [],
    })
  })
})

describe('turn machine — ending and cycling (316.9, 317)', () => {
  it('passing in the Main Phase ends the turn and hands over to the opponent', () => {
    const { state } = advanceFlow(atTurnStart())
    const result = applyAction(state, { type: 'pass', player: 0 }, oracle)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.turnPlayer).toBe(1)
    expect(result.state.phase).toBe('main')
    expect(result.state.priority).toBe(1)
    expect(result.state.turnNumber).toBe(2)
  })

  it('heals all damage during the Expiration Step (317.2.b, 143.3.b)', () => {
    const start = atTurnStart()
    const damaged: GameState = {
      ...start,
      objects: {
        ...start.objects,
        hurt: {
          id: 'hurt',
          cardId: 'unit-3',
          owner: 0,
          controller: 0,
          zone: 'base',
          exhausted: false,
          damage: 2,
          buffs: 0,
          faceDown: false,
        },
      },
    }
    const { state } = advanceFlow(damaged)
    const afterPass = applyAction(state, { type: 'pass', player: 0 }, oracle)
    expect(afterPass.ok).toBe(true)
    if (!afterPass.ok) return
    expect(afterPass.state.objects.hurt?.damage).toBe(0)
  })

  it('clears scoredThisTurn when the turn changes (470)', () => {
    const start = atTurnStart()
    const scored: GameState = {
      ...start,
      players: { ...start.players, 0: { ...start.players[0], scoredThisTurn: ['bf-0'] } },
    }
    const { state } = advanceFlow(scored)
    const next = applyAction(state, { type: 'pass', player: 0 }, oracle)
    if (!next.ok) throw new Error('pass rejected')
    expect(next.state.players[0].scoredThisTurn).toEqual([])
  })
})

describe('scoring (467-472)', () => {
  it('Holds every Battlefield the Turn Player controls during the Scoring Step (315.2.b.2)', () => {
    const start = atTurnStart({
      battlefields: [
        { id: 'bf-0', controller: 0, contested: false, facedown: [] },
        { id: 'bf-1', contested: false, facedown: [] },
      ],
    })
    const { state } = advanceFlow(start)
    expect(state.players[0].points).toBe(1)
    expect(state.players[0].scoredThisTurn).toEqual(['bf-0'])
  })

  it('scores a Battlefield at most once per turn (470)', () => {
    const events: GameEvent[] = []
    const start = atTurnStart()
    const once = score(start, 0, 'bf-0', 'hold', events)
    const twice = score(once, 0, 'bf-0', 'hold', events)
    expect(twice.players[0].points).toBe(1)
  })

  it('wins at the Victory Score (472)', () => {
    const start = atTurnStart({
      battlefields: [
        { id: 'bf-0', controller: 0, contested: false, facedown: [] },
        { id: 'bf-1', contested: false, facedown: [] },
      ],
    })
    const nearly: GameState = {
      ...start,
      players: { ...start.players, 0: { ...start.players[0], points: VICTORY_SCORE - 1 } },
    }
    const { state, events } = advanceFlow(nearly)
    expect(state.winner).toBe(0)
    expect(events).toContainEqual({ type: 'game-won', player: 0 })
  })
})

describe('the Final Point rule (471.1.b)', () => {
  const atSevenPoints = () => {
    const start = atTurnStart()
    return {
      ...start,
      players: { ...start.players, 0: { ...start.players[0], points: VICTORY_SCORE - 1 } },
    }
  }

  it('refuses the winning point on a Conquer that has not Scored every Battlefield', () => {
    const events: GameEvent[] = []
    const after = score(atSevenPoints(), 0, 'bf-0', 'conquer', events)
    // The Score is recorded, but no point is gained — the player draws instead.
    expect(after.players[0].points).toBe(VICTORY_SCORE - 1)
    expect(after.players[0].scoredThisTurn).toEqual(['bf-0'])
    expect(events).not.toContainEqual({ type: 'points-gained', player: 0, amount: 1 })
  })

  it('grants it once every Battlefield has been Scored this turn (471.1.b.1)', () => {
    const events: GameEvent[] = []
    // First Conquer is refused the point (not every Battlefield Scored yet) but
    // is still recorded; the second then completes the set and wins.
    const first = score(atSevenPoints(), 0, 'bf-0', 'conquer', events)
    expect(first.players[0].points).toBe(VICTORY_SCORE - 1)
    const second = score(first, 0, 'bf-1', 'conquer', events)
    expect(second.players[0].points).toBe(VICTORY_SCORE)
  })

  it('does not restrict a Hold — only Conquer is restricted (471.1.a.1)', () => {
    const events: GameEvent[] = []
    const after = score(atSevenPoints(), 0, 'bf-0', 'hold', events)
    expect(after.players[0].points).toBe(VICTORY_SCORE)
  })
})

describe('Burn Out during the Draw Phase (315.4.b.1, 431)', () => {
  it('burns out, gives the opponent a point, and still draws', () => {
    const start = makeState(
      [
        { id: 'dead', cardId: 'card', owner: 0, zone: 'trash' },
        { id: 'r1', cardId: 'rune', owner: 0, zone: 'runeDeck' },
      ],
      { phase: 'awaken', step: 'ready', priority: null },
    )
    const { state, events } = advanceFlow(start)
    expect(events).toContainEqual({ type: 'burned-out', player: 0, gavePointTo: 1 })
    expect(state.players[1].points).toBe(1)
    expect(state.players[0].hand).toEqual(['dead'])
  })
})

describe('actions', () => {
  it('rejects a pass from the player without priority', () => {
    const { state } = advanceFlow(atTurnStart())
    const result = applyAction(state, { type: 'pass', player: 1 }, oracle)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('not-your-priority')
  })

  it('lets either player concede, and the opponent wins (650)', () => {
    const { state } = advanceFlow(atTurnStart())
    const result = applyAction(state, { type: 'concede', player: 0 }, oracle)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.winner).toBe(1)
  })

  it('refuses every action once the game is over', () => {
    const { state } = advanceFlow(atTurnStart())
    const conceded = applyAction(state, { type: 'concede', player: 0 }, oracle)
    if (!conceded.ok) throw new Error('concede rejected')
    const after = applyAction(conceded.state, { type: 'pass', player: 1 }, oracle)
    expect(after.ok).toBe(false)
    if (after.ok) return
    expect(after.error.code).toBe('game-over')
    expect(legalActions(conceded.state, 1)).toEqual([])
  })

  it('offers pass only to the player holding priority', () => {
    const { state } = advanceFlow(atTurnStart())
    expect(legalActions(state, 0).map((a) => a.type)).toContain('pass')
    expect(legalActions(state, 1).map((a) => a.type)).not.toContain('pass')
  })
})

describe('determinism', () => {
  it('replays a sequence of turns identically', () => {
    const play = () => {
      let current = advanceFlow(atTurnStart()).state
      for (let i = 0; i < 6; i += 1) {
        const result = applyAction(current, { type: 'pass', player: current.turnPlayer }, oracle)
        if (!result.ok) throw new Error('pass rejected')
        current = result.state
      }
      return current
    }
    expect(JSON.stringify(play())).toBe(JSON.stringify(play()))
  })
})
