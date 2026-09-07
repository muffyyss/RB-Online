import { describe, expect, it } from 'vitest'

import { applyAction, legalActions } from '../src/actions/index.js'
import { oracleFrom } from '../src/effects/oracle.js'
import { runCleanup, stagedCombats } from '../src/flow/cleanup.js'
import { VICTORY_SCORE } from '../src/flow/phases.js'
import type { GameEvent } from '../src/effects/events.js'
import type { GameState, Location, PlayerId } from '../src/state/game-state.js'
import { makeState } from './support/state.js'

const oracle = oracleFrom({
  soldier: {
    type: 'unit',
    name: 'Soldier',
    domains: ['fury'],
    tags: [],
    might: 3,
    keywords: [],
    abilities: [],
  },
  gear: {
    type: 'gear',
    name: 'Banner',
    domains: ['fury'],
    tags: [],
    keywords: [],
    abilities: [],
  },
})

const BF: Location = { kind: 'battlefield', id: 'bf-0' }
const base = (player: PlayerId): Location => ({ kind: 'base', player })

/** A unit sitting ready in its controller's base. */
function withUnits(
  specs: readonly { id: string; owner: PlayerId; at: Location; exhausted?: boolean }[],
  overrides: Partial<GameState> = {},
): GameState {
  const state = makeState(
    specs.map((u) => ({
      id: u.id,
      cardId: 'soldier',
      owner: u.owner,
      zone: u.at.kind === 'battlefield' ? ('battlefield' as const) : ('base' as const),
      exhausted: u.exhausted ?? false,
    })),
    { phase: 'main', step: 'main', turnPlayer: 0, priority: 0, ...overrides },
  )
  const objects = { ...state.objects }
  for (const u of specs) {
    const object = objects[u.id]
    if (object) objects[u.id] = { ...object, location: u.at }
  }
  return { ...state, objects }
}

describe('the Standard Move (144)', () => {
  it('moves a unit from base to a battlefield and exhausts it (144.2)', () => {
    const state = withUnits([{ id: 'u1', owner: 0, at: base(0) }])
    const result = applyAction(state, { type: 'move', player: 0, units: ['u1'], to: BF }, oracle)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.objects.u1?.location).toEqual(BF)
    expect(result.state.objects.u1?.zone).toBe('battlefield')
    expect(result.state.objects.u1?.exhausted).toBe(true)
  })

  it('refuses to move an already exhausted unit — it cannot pay the cost', () => {
    const state = withUnits([{ id: 'u1', owner: 0, at: base(0), exhausted: true }])
    const result = applyAction(state, { type: 'move', player: 0, units: ['u1'], to: BF }, oracle)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.message).toBe('exhausted')
  })

  it('moves several units together as one action (144.3)', () => {
    const state = withUnits([
      { id: 'u1', owner: 0, at: base(0) },
      { id: 'u2', owner: 0, at: base(0) },
    ])
    const result = applyAction(
      state,
      { type: 'move', player: 0, units: ['u1', 'u2'], to: BF },
      oracle,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.objects.u1?.location).toEqual(BF)
    expect(result.state.objects.u2?.location).toEqual(BF)
  })

  it('refuses battlefield-to-battlefield without Ganking (144.4.c.1)', () => {
    const state = withUnits([{ id: 'u1', owner: 0, at: BF }])
    const result = applyAction(
      state,
      { type: 'move', player: 0, units: ['u1'], to: { kind: 'battlefield', id: 'bf-1' } },
      oracle,
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.message).toBe('illegal-destination')
  })

  it('allows a battlefield unit to return to its own base (144.4.b)', () => {
    const state = withUnits([{ id: 'u1', owner: 0, at: BF }])
    const result = applyAction(
      state,
      { type: 'move', player: 0, units: ['u1'], to: base(0) },
      oracle,
    )
    expect(result.ok).toBe(true)
  })

  it('refuses moves outside your own Main Phase (144.1.a)', () => {
    const state = withUnits([{ id: 'u1', owner: 0, at: base(0) }], { phase: 'draw', step: 'draw' })
    const result = applyAction(state, { type: 'move', player: 0, units: ['u1'], to: BF }, oracle)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.message).toBe('not-your-main')
  })

  it('refuses moves while a Chain exists (144.1.b)', () => {
    const state = withUnits([{ id: 'u1', owner: 0, at: base(0) }], {
      chain: [{ id: 'c1', controller: 1, source: 'x', pending: false, bindings: {} }],
    })
    const result = applyAction(state, { type: 'move', player: 0, units: ['u1'], to: BF }, oracle)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.message).toBe('chain-open')
  })

  it('refuses moves during a Showdown (144.1.c)', () => {
    const state = withUnits([{ id: 'u1', owner: 0, at: base(0) }], {
      showdown: { battlefield: 'bf-1', combat: true },
    })
    const result = applyAction(state, { type: 'move', player: 0, units: ['u1'], to: BF }, oracle)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.message).toBe('showdown-in-progress')
  })

  it('refuses to move gear — the Standard Move belongs to Units (144)', () => {
    const state = makeState([{ id: 'g1', cardId: 'gear', owner: 0, zone: 'base' }], {
      phase: 'main',
      step: 'main',
      priority: 0,
    })
    const located: GameState = {
      ...state,
      objects: { ...state.objects, g1: { ...state.objects.g1!, location: base(0) } },
    }
    const result = applyAction(located, { type: 'move', player: 0, units: ['g1'], to: BF }, oracle)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.message).toBe('not-a-unit')
  })
})

describe('Control and Conquer (190.4, 469.1)', () => {
  it('taking an empty battlefield establishes Control and scores a Conquer', () => {
    const state = withUnits([{ id: 'u1', owner: 0, at: base(0) }])
    const result = applyAction(state, { type: 'move', player: 0, units: ['u1'], to: BF }, oracle)
    if (!result.ok) throw new Error('move rejected')

    expect(result.state.battlefields[0]?.controller).toBe(0)
    expect(result.state.players[0].points).toBe(1)
    expect(result.events).toContainEqual({ type: 'points-gained', player: 0, amount: 1 })
  })

  it('scores that battlefield only once per turn (470)', () => {
    const state = withUnits([
      { id: 'u1', owner: 0, at: base(0) },
      { id: 'u2', owner: 0, at: base(0) },
    ])
    const first = applyAction(state, { type: 'move', player: 0, units: ['u1'], to: BF }, oracle)
    if (!first.ok) throw new Error('rejected')
    const second = applyAction(
      first.state,
      { type: 'move', player: 0, units: ['u2'], to: BF },
      oracle,
    )
    if (!second.ok) throw new Error('rejected')
    expect(second.state.players[0].points).toBe(1)
  })

  it('keeps Control while units remain there (190.4.a)', () => {
    const held = withUnits([{ id: 'u1', owner: 0, at: BF }], {
      battlefields: [
        { id: 'bf-0', controller: 0, contested: false, facedown: [] },
        { id: 'bf-1', contested: false, facedown: [] },
      ],
    })
    const events: GameEvent[] = []
    const after = runCleanup(held, events)
    expect(after.battlefields[0]?.controller).toBe(0)
  })

  it('loses Control when the last unit leaves (190.4.c)', () => {
    const held = withUnits([{ id: 'u1', owner: 0, at: base(0) }], {
      battlefields: [
        { id: 'bf-0', controller: 0, contested: false, facedown: [] },
        { id: 'bf-1', contested: false, facedown: [] },
      ],
    })
    const events: GameEvent[] = []
    const after = runCleanup(held, events)
    expect(after.battlefields[0]?.controller).toBeUndefined()
    expect(events).toContainEqual({ type: 'battlefield-uncontrolled', battlefield: 'bf-0' })
  })

  it('wins the game when a Conquer reaches the Victory Score', () => {
    const state = withUnits([{ id: 'u1', owner: 0, at: base(0) }])
    const nearly: GameState = {
      ...state,
      players: { ...state.players, 0: { ...state.players[0], points: VICTORY_SCORE - 1 } },
      // Both battlefields already Scored this turn, so the Final Point is
      // allowed (471.1.b.1) once this one is Conquered.
      battlefields: [
        { id: 'bf-0', contested: false, facedown: [] },
        { id: 'bf-1', contested: false, facedown: [] },
      ],
    }
    const scoredOther: GameState = {
      ...nearly,
      players: { ...nearly.players, 0: { ...nearly.players[0], scoredThisTurn: ['bf-1'] } },
    }
    const result = applyAction(
      scoredOther,
      { type: 'move', player: 0, units: ['u1'], to: BF },
      oracle,
    )
    if (!result.ok) throw new Error('rejected')
    expect(result.state.players[0].points).toBe(VICTORY_SCORE)
    expect(result.state.winner).toBe(0)
  })
})

describe('Contested and staged combat (190.3, 461)', () => {
  it('marks a battlefield Contested when an opponent unit arrives', () => {
    const state = withUnits(
      [
        { id: 'mine', owner: 0, at: BF },
        { id: 'theirs', owner: 1, at: base(1) },
      ],
      {
        battlefields: [
          { id: 'bf-0', controller: 0, contested: false, facedown: [] },
          { id: 'bf-1', contested: false, facedown: [] },
        ],
        turnPlayer: 1,
        priority: 1,
      },
    )
    const result = applyAction(
      state,
      { type: 'move', player: 1, units: ['theirs'], to: BF },
      oracle,
    )
    if (!result.ok) throw new Error('rejected')
    expect(result.state.battlefields[0]?.contested).toBe(true)
    // Control does not change while a combat is pending (190.4.b).
    expect(result.state.battlefields[0]?.controller).toBe(0)
  })

  it('reports a staged combat where opposing units meet (461)', () => {
    const state = withUnits([
      { id: 'mine', owner: 0, at: BF },
      { id: 'theirs', owner: 1, at: BF },
    ])
    expect(stagedCombats(state)).toEqual(['bf-0'])
  })

  it('does not score a Conquer while the battlefield is contested', () => {
    const state = withUnits(
      [
        { id: 'mine', owner: 0, at: BF },
        { id: 'theirs', owner: 1, at: base(1) },
      ],
      { turnPlayer: 1, priority: 1 },
    )
    const result = applyAction(
      state,
      { type: 'move', player: 1, units: ['theirs'], to: BF },
      oracle,
    )
    if (!result.ok) throw new Error('rejected')
    expect(result.state.players[1].points).toBe(0)
  })
})

describe('legalActions offers moves', () => {
  it('offers a ready unit its legal destinations', () => {
    const state = withUnits([{ id: 'u1', owner: 0, at: base(0) }])
    const moves = legalActions(state, 0, oracle).filter((a) => a.type === 'move')
    // From base: both battlefields, but not its own base.
    expect(moves).toHaveLength(2)
  })

  it('offers nothing for an exhausted unit', () => {
    const state = withUnits([{ id: 'u1', owner: 0, at: base(0), exhausted: true }])
    expect(legalActions(state, 0, oracle).filter((a) => a.type === 'move')).toEqual([])
  })
})
