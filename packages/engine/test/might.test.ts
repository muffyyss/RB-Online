import { describe, expect, it } from 'vitest'

import { beginExecution } from '../src/effects/interpreter.js'
import { mightOf } from '../src/effects/might.js'
import { keywordValue, oracleFrom } from '../src/effects/oracle.js'
import { effectStepSchema } from '../src/effects/steps.js'
import type { EffectStep } from '../src/effects/steps.js'
import { advanceFlow } from '../src/flow/phases.js'
import type { GameState } from '../src/state/game-state.js'
import { makeState } from './support/state.js'
import type { ObjectSpec } from './support/state.js'

const unit = (might: number) => ({
  type: 'unit' as const,
  name: `Might ${String(might)}`,
  domains: ['fury' as const],
  tags: [],
  might,
  keywords: [],
  abilities: [],
})

const oracle = oracleFrom({ m1: unit(1), m2: unit(2), m5: unit(5) })

/** Units on bf-0 plus a source `src`, which is itself a unit on the board. */
function board(specs: readonly Omit<ObjectSpec, 'zone'>[]): GameState {
  const state = makeState([
    { id: 'src', cardId: 'm2', owner: 0, zone: 'battlefield' },
    ...specs.map((s) => ({ ...s, zone: 'battlefield' as const })),
  ])
  const objects = { ...state.objects }
  for (const [id, object] of Object.entries(objects)) {
    objects[id] = { ...object, location: { kind: 'battlefield', id: 'bf-0' } }
  }
  return { ...state, objects }
}

const run = (state: GameState, steps: readonly EffectStep[]) =>
  beginExecution(state, { source: 'src', controller: 0, steps }, oracle)

const give = (target: string, amount: number, minimum?: number): EffectStep => ({
  op: 'give-might',
  amount,
  target,
  duration: 'this-turn',
  ...(minimum === undefined ? {} : { minimum }),
})

const eachOpponentUnit = (steps: readonly EffectStep[]): EffectStep => ({
  op: 'for-each',
  of: { kind: 'unit', controller: 'opponent' },
  as: '$u',
  steps,
})

describe('Might given this turn', () => {
  it('adds to Might without placing Buffs, which are counters (702)', () => {
    const result = run(board([{ id: 'u', cardId: 'm2', owner: 1 }]), [
      eachOpponentUnit([give('$u', 2)]),
    ])
    expect(result.state.objects.u?.mightThisTurn).toBe(2)
    expect(result.state.objects.u?.buffs).toBe(0)
    expect(result.events).toContainEqual({ type: 'might-given', target: 'u', amount: 2 })
  })

  it('keeps a unit alive through damage it would otherwise die to', () => {
    const result = run(board([{ id: 'u', cardId: 'm2', owner: 1 }]), [
      eachOpponentUnit([give('$u', 1), { op: 'deal', amount: 2, target: '$u' }]),
    ])
    expect(result.state.objects.u?.zone).toBe('battlefield')
    expect(result.state.objects.u?.damage).toBe(2)
  })

  it.each([
    ['m5', -4],
    ['m2', -1],
    ['m1', 0],
  ])('snapshots "-4, to a minimum of 1" on a %s unit as %i (477.3.b)', (cardId, applied) => {
    const result = run(board([{ id: 'u', cardId, owner: 1 }]), [
      eachOpponentUnit([give('$u', -4, 1)]),
    ])
    expect(result.events).toContainEqual({ type: 'might-given', target: 'u', amount: applied })
    expect(result.state.objects.u?.mightThisTurn).toBe(applied)
  })

  it('kills a unit whose Might falls to the damage on it (143.2.a)', () => {
    const state = board([{ id: 'u', cardId: 'm2', owner: 1, damage: 1 }])
    const result = run(state, [eachOpponentUnit([give('$u', -1, 1)])])
    expect(result.state.objects.u?.zone).toBe('trash')
    expect(result.events).toContainEqual({ type: 'killed', target: 'u' })
  })

  it('is cleared when the unit leaves the board', () => {
    const state = board([{ id: 'u', cardId: 'm2', owner: 1 }])
    const result = run(state, [eachOpponentUnit([give('$u', 3), { op: 'kill', target: '$u' }])])
    expect(result.state.objects.u?.zone).toBe('trash')
    expect(result.state.objects.u?.mightThisTurn).toBeUndefined()
  })

  it('expires in the Expiration Step, after healing (317.2.b-c)', () => {
    const state = board([{ id: 'u', cardId: 'm2', owner: 0, damage: 3 }])
    const u = state.objects.u
    if (!u) throw new Error('missing unit')
    const ending: GameState = {
      ...state,
      objects: { ...state.objects, u: { ...u, mightThisTurn: 2 } },
      phase: 'ending',
      step: 'expiration',
      stepTaskDone: false,
      priority: null,
    }
    const { state: next } = advanceFlow(ending, oracle)
    expect(next.turnNumber).toBe(2)
    expect(next.objects.u?.zone).toBe('battlefield')
    expect(next.objects.u?.damage).toBe(0)
    expect(next.objects.u).not.toHaveProperty('mightThisTurn')
  })
})

describe('Assault and Shield', () => {
  const facts = {
    type: 'unit' as const,
    name: 'Raider',
    domains: ['fury' as const],
    tags: [],
    might: 3,
    keywords: ['assault' as const, 'shield' as const],
    keywordValues: { shield: 2 },
    abilities: [],
  }
  const raider = makeState([{ id: 'r', cardId: 'raider', owner: 0, zone: 'battlefield' }]).objects.r
  if (!raider) throw new Error('missing unit')

  it('count only while the unit holds the matching combat role', () => {
    const raiders = oracleFrom({ raider: facts })
    const might = (object: typeof raider) => mightOf({ objects: { r: object } }, object, raiders)
    expect(might(raider)).toBe(3)
    expect(might({ ...raider, combatRole: 'attacker' })).toBe(4) // [Assault] is 1
    expect(might({ ...raider, combatRole: 'defender' })).toBe(5) // [Shield 2]
  })

  it('reads a keyword printed without a number as 1, and a missing one as 0', () => {
    expect(keywordValue(facts, 'assault')).toBe(1)
    expect(keywordValue(facts, 'shield')).toBe(2)
    expect(keywordValue(facts, 'tank')).toBe(0)
  })
})

describe("$me - the ability's own source", () => {
  it('targets the source while it is on the board', () => {
    const result = run(board([]), [give('$me', 3)])
    expect(result.state.objects.src?.mightThisTurn).toBe(3)
  })

  it('does nothing once the source has left the board', () => {
    const state = board([])
    const src = state.objects.src
    if (!src) throw new Error('missing source')
    const gone = {
      ...state,
      objects: { ...state.objects, src: { ...src, zone: 'trash' as const } },
    }
    const result = run(gone, [give('$me', 3)])
    expect(result.state.objects.src?.mightThisTurn).toBeUndefined()
  })

  it('cannot be bound by a step', () => {
    const parsed = effectStepSchema.safeParse({
      op: 'choose',
      as: '$me',
      from: { kind: 'unit' },
    })
    expect(parsed.success).toBe(false)
  })
})
