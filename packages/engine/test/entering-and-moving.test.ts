import { describe, expect, it } from 'vitest'

import { applyAction } from '../src/actions/index.js'
import { beginExecution } from '../src/effects/interpreter.js'
import { oracleFrom } from '../src/effects/oracle.js'
import type { CardFacts } from '../src/effects/oracle.js'
import { advanceFlow } from '../src/flow/phases.js'
import type { GameState, Location, PlayerId } from '../src/state/game-state.js'
import { makeState } from './support/state.js'

const unit = (extra: Partial<CardFacts> = {}): CardFacts => ({
  type: 'unit',
  name: 'Unit',
  domains: ['fury'],
  tags: [],
  cost: { energy: 0, power: [] },
  might: 3,
  keywords: [],
  abilities: [],
  ...extra,
})

const oracle = oracleFrom({
  plain: unit(),
  eager: unit({
    abilities: [
      { id: 'eager-ready', kind: 'passive', steps: [], effect: { kind: 'enters-ready' } },
    ],
  }),
  unfinished: unit({
    abilities: [
      {
        id: 'unfinished-ready',
        kind: 'passive',
        steps: [],
        effect: { kind: 'enters-ready' },
        notImplemented: 'not really',
      },
    ],
  }),
  ganker: unit({ keywords: ['ganking'] }),
})

const BF0: Location = { kind: 'battlefield', id: 'bf-0' }
const BF1: Location = { kind: 'battlefield', id: 'bf-1' }

function scene(
  specs: readonly { id: string; cardId: string; owner: PlayerId; at: Location | 'hand' }[],
): GameState {
  const state = makeState(
    specs.map((s) => ({
      id: s.id,
      cardId: s.cardId,
      owner: s.owner,
      zone: s.at === 'hand' ? 'hand' : s.at.kind === 'base' ? 'base' : 'battlefield',
    })),
    { phase: 'main', step: 'main', turnPlayer: 0, priority: 0 },
  )
  const objects = { ...state.objects }
  for (const s of specs) {
    const object = objects[s.id]
    if (object && s.at !== 'hand') objects[s.id] = { ...object, location: s.at }
  }
  return { ...state, objects }
}

/** Play a card from hand and pass until the Chain is empty. */
function play(state: GameState, card: string): GameState {
  let result = applyAction(state, { type: 'play-card', player: 0, card }, oracle)
  for (let i = 0; i < 10 && result.ok && result.state.chain.length > 0; i += 1) {
    result = applyAction(result.state, { type: 'pass', player: result.state.priority ?? 0 }, oracle)
  }
  if (!result.ok) throw new Error(result.error.message)
  return result.state
}

describe('entering ready (143.4, 805.6)', () => {
  it('a unit with an enters-ready passive enters ready; others enter exhausted', () => {
    const state = scene([
      { id: 'e', cardId: 'eager', owner: 0, at: 'hand' },
      { id: 'p', cardId: 'plain', owner: 0, at: 'hand' },
    ])
    const after = play(play(state, 'e'), 'p')
    expect(after.objects.e?.exhausted).toBe(false)
    expect(after.objects.p?.exhausted).toBe(true)
  })

  it('ignores a passive still marked notImplemented', () => {
    const after = play(scene([{ id: 'u', cardId: 'unfinished', owner: 0, at: 'hand' }]), 'u')
    expect(after.objects.u?.exhausted).toBe(true)
  })

  it('"units you play this turn enter ready" lasts until the Expiration Step (317.2.c)', () => {
    const state = scene([{ id: 'p', cardId: 'plain', owner: 0, at: 'hand' }])
    const granted = beginExecution(
      state,
      { source: 'p', controller: 0, steps: [{ op: 'units-enter-ready', duration: 'this-turn' }] },
      oracle,
    ).state
    expect(play(granted, 'p').objects.p?.exhausted).toBe(false)

    const ending: GameState = {
      ...granted,
      phase: 'ending',
      step: 'expiration',
      stepTaskDone: false,
      priority: null,
    }
    const next = advanceFlow(ending, oracle).state
    expect(next.turnNumber).toBe(2)
    expect(next.players[0]).not.toHaveProperty('unitsEnterReadyThisTurn')
  })
})

describe('Ganking (810)', () => {
  it('permits a Standard Move from battlefield to battlefield', () => {
    const state = scene([{ id: 'g', cardId: 'ganker', owner: 0, at: BF0 }])
    const result = applyAction(state, { type: 'move', player: 0, units: ['g'], to: BF1 }, oracle)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.objects.g?.location).toEqual(BF1)
  })
})

describe('the move step (420, 449)', () => {
  it("sends a unit at a battlefield to its controller's base, without exhausting it", () => {
    const state = scene([
      { id: 'mine', cardId: 'plain', owner: 0, at: BF0 },
      { id: 'theirs', cardId: 'plain', owner: 1, at: BF1 },
    ])
    const result = beginExecution(
      state,
      {
        source: 'mine',
        controller: 0,
        steps: [
          {
            op: 'for-each',
            of: { kind: 'unit' },
            as: '$u',
            steps: [{ op: 'move', target: '$u', to: 'base' }],
          },
        ],
      },
      oracle,
    )
    expect(result.state.objects.mine).toMatchObject({
      zone: 'base',
      location: { kind: 'base', player: 0 },
      exhausted: false,
    })
    expect(result.state.objects.theirs?.location).toEqual({ kind: 'base', player: 1 })
    expect(result.events).toContainEqual({
      type: 'moved',
      unit: 'theirs',
      to: { kind: 'base', player: 1 },
    })
  })

  it('does not move a unit already at base: a Move needs somewhere else to go (447)', () => {
    const state = scene([
      { id: 'home', cardId: 'plain', owner: 0, at: { kind: 'base', player: 0 } },
    ])
    const result = beginExecution(
      state,
      { source: 'home', controller: 0, steps: [{ op: 'move', target: '$me', to: 'base' }] },
      oracle,
    )
    expect(result.events.some((event) => event.type === 'moved')).toBe(false)
  })
})
