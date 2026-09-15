import { describe, expect, it } from 'vitest'

import { beginExecution, resolveChoice } from '../src/effects/interpreter.js'
import type { ExecutionResult } from '../src/effects/interpreter.js'
import { oracleFrom } from '../src/effects/oracle.js'
import { resolveSelector } from '../src/effects/selector.js'
import type { EffectStep } from '../src/effects/steps.js'
import type { GameState, Location, ObjectId } from '../src/state/game-state.js'
import { redactFor } from '../src/state/redact.js'
import { makeState } from './support/state.js'

const oracle = oracleFrom({
  unit: {
    type: 'unit',
    name: 'Unit',
    domains: ['fury'],
    tags: [],
    might: 3,
    keywords: [],
    abilities: [],
  },
})

const BF0: Location = { kind: 'battlefield', id: 'bf-0' }

/** Player 0's source `src` at bf-0, and cards to draw. */
function scene(extra: readonly { id: string; owner: 0 | 1; at: Location }[] = []): GameState {
  const state = makeState([
    { id: 'src', cardId: 'unit', owner: 0, zone: 'battlefield' },
    ...extra.map((e) => ({
      id: e.id,
      cardId: 'unit',
      owner: e.owner,
      zone: e.at.kind === 'base' ? ('base' as const) : ('battlefield' as const),
    })),
    { id: 'd1', cardId: 'unit', owner: 0, zone: 'mainDeck' },
    { id: 'd2', cardId: 'unit', owner: 0, zone: 'mainDeck' },
    { id: 'd3', cardId: 'unit', owner: 0, zone: 'mainDeck' },
  ])
  const objects = { ...state.objects }
  const src = objects.src
  if (src) objects.src = { ...src, location: BF0 }
  for (const e of extra) {
    const object = objects[e.id]
    if (object) objects[e.id] = { ...object, location: e.at }
  }
  return { ...state, objects }
}

const run = (state: GameState, steps: readonly EffectStep[]) =>
  beginExecution(state, { source: 'src', controller: 0, steps }, oracle)

/** Answer the pending choice. */
function answer(result: ExecutionResult, chosen: readonly ObjectId[]): ExecutionResult {
  if (result.status !== 'awaiting-choice' || !result.state.pendingChoice) {
    throw new Error('expected a pending choice')
  }
  return resolveChoice(
    result.state,
    result.execution,
    result.state.pendingChoice.binding,
    chosen,
    oracle,
  )
}

const hand = (result: ExecutionResult) => result.state.players[0].hand.length

describe('may: a yes-or-no question', () => {
  const steps: readonly EffectStep[] = [
    { op: 'may', steps: [{ op: 'draw', amount: 1 }] },
    { op: 'draw', amount: 1 },
  ]

  it('asks the controller, offering only the source', () => {
    const asked = run(scene(), steps)
    expect(asked.status).toBe('awaiting-choice')
    expect(asked.state.pendingChoice).toMatchObject({
      player: 0,
      kind: 'may',
      candidates: ['src'],
      min: 0,
      max: 1,
      optional: true,
    })
    expect(hand(asked)).toBe(0) // nothing happens before the answer
  })

  it('runs its steps on yes, then carries on', () => {
    const done = answer(run(scene(), steps), ['src'])
    expect(done.status).toBe('done')
    expect(hand(done)).toBe(2)
  })

  it('skips its steps on no, then carries on', () => {
    const done = answer(run(scene(), steps), [])
    expect(done.status).toBe('done')
    expect(hand(done)).toBe(1)
    expect(done.events).toContainEqual(expect.objectContaining({ reason: 'declined' }))
  })

  it('keeps a nested may’s answer separate from the outer one', () => {
    const nested: readonly EffectStep[] = [
      {
        op: 'may',
        steps: [
          { op: 'draw', amount: 1 },
          { op: 'may', steps: [{ op: 'draw', amount: 1 }] },
          { op: 'draw', amount: 1 },
        ],
      },
    ]
    // Yes to the outer, no to the inner: the outer's remaining step still runs.
    const done = answer(answer(run(scene(), nested), ['src']), [])
    expect(done.status).toBe('done')
    expect(hand(done)).toBe(2)
  })

  it('shows the opponent that a question is pending, but not what it offers', () => {
    const asked = run(scene(), steps)
    const theirs = redactFor(asked.state, 1).pendingChoice
    expect(theirs).toMatchObject({ player: 0, kind: 'may', candidateCount: 1 })
    expect(theirs).not.toHaveProperty('candidates')
  })
})

describe('if: a condition checked as the step runs', () => {
  const ifUnitsHere = (atMost: number): EffectStep => ({
    op: 'if',
    condition: {
      kind: 'count',
      of: { kind: 'unit', controller: 'self', at: 'same-location' },
      atMost,
    },
    then: [{ op: 'draw', amount: 1 }],
    else: [{ op: 'draw', amount: 2 }],
  })

  it('runs then when it holds, else when it does not', () => {
    expect(hand(run(scene(), [ifUnitsHere(1)]))).toBe(1)
    const crowded = scene([{ id: 'friend', owner: 0, at: BF0 }])
    expect(hand(run(crowded, [ifUnitsHere(1)]))).toBe(2)
  })

  it('left-board: true once the bound object has left the board, false if nothing was bound', () => {
    const drawIfGone: EffectStep = {
      op: 'if',
      condition: { kind: 'left-board', target: '$victim' },
      then: [{ op: 'draw', amount: 1 }],
    }
    const state = scene([{ id: 'foe', owner: 1, at: BF0 }])
    const choose: EffectStep = {
      op: 'choose',
      as: '$victim',
      from: { kind: 'unit', controller: 'opponent' },
    }
    const killed = answer(run(state, [choose, { op: 'kill', target: '$victim' }, drawIfGone]), [
      'foe',
    ])
    expect(hand(killed)).toBe(1)
    const spared = answer(run(state, [choose, drawIfGone]), ['foe'])
    expect(hand(spared)).toBe(0)
    expect(hand(run(scene(), [drawIfGone]))).toBe(0)
  })
})

describe('selector additions', () => {
  it('at a bound unit means that unit’s Location', () => {
    const state = scene([
      { id: 'there', owner: 0, at: BF0 },
      { id: 'home', owner: 0, at: { kind: 'base', player: 0 } },
    ])
    const ids = resolveSelector(
      state,
      { kind: 'unit', at: '$pick' },
      { controller: 0, source: 'src', oracle, bindings: { $pick: ['there'] } },
    )
    expect([...ids].sort()).toEqual(['src', 'there'])
  })

  it('inCombat picks out units holding a combat role', () => {
    const state = scene([{ id: 'foe', owner: 1, at: BF0 }])
    const foe = state.objects.foe
    if (!foe) throw new Error('missing unit')
    const fighting = {
      ...state,
      objects: { ...state.objects, foe: { ...foe, combatRole: 'defender' as const } },
    }
    const ctx = { controller: 0 as const, source: 'src', oracle }
    expect(resolveSelector(fighting, { kind: 'unit', inCombat: true }, ctx)).toEqual(['foe'])
    expect(resolveSelector(fighting, { kind: 'unit', inCombat: false }, ctx)).toEqual(['src'])
  })
})
