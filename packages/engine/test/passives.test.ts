import { describe, expect, it } from 'vitest'

import { beginExecution } from '../src/effects/interpreter.js'
import { mightOf } from '../src/effects/might.js'
import { oracleFrom } from '../src/effects/oracle.js'
import type { CardFacts, EngineAbility } from '../src/effects/oracle.js'
import { passiveEffectSchema } from '../src/effects/steps.js'
import type { PassiveEffect } from '../src/effects/steps.js'
import { settleBoard } from '../src/flow/cleanup.js'
import type { GameEvent } from '../src/effects/events.js'
import type { GameState, Location } from '../src/state/game-state.js'
import { makeState } from './support/state.js'

const passive = (id: string, effect: PassiveEffect): EngineAbility => ({
  id,
  kind: 'passive',
  steps: [],
  effect,
})

const unit = (might: number, abilities: readonly EngineAbility[] = []): CardFacts => ({
  type: 'unit',
  name: 'Unit',
  domains: ['fury'],
  tags: [],
  might,
  keywords: [],
  abilities,
})

const oracle = oracleFrom({
  plain: unit(4),
  big: unit(10),
  captain: unit(3, [
    passive('captain-aura', {
      kind: 'might',
      amount: 1,
      to: { kind: 'unit', controller: 'self', other: true },
    }),
  ]),
  gunner: unit(3, [passive('gunner-bonus', { kind: 'bonus-damage', amount: 1, dealtBy: 'self' })]),
})

const BF0: Location = { kind: 'battlefield', id: 'bf-0' }

function scene(specs: readonly { id: string; cardId: string; owner: 0 | 1; damage?: number }[]) {
  const state = makeState(specs.map((s) => ({ ...s, zone: 'battlefield' as const })))
  const objects = { ...state.objects }
  for (const s of specs) {
    const object = objects[s.id]
    if (object) objects[s.id] = { ...object, location: BF0 }
  }
  return { ...state, objects }
}

const might = (state: GameState, id: string) => {
  const object = state.objects[id]
  return object && mightOf(state, object, oracle)
}

const deal = (state: GameState, amount: number) =>
  beginExecution(
    state,
    {
      source: 'src',
      controller: 0,
      steps: [{ op: 'deal', amount, target: { kind: 'unit', controller: 'opponent' } }],
    },
    oracle,
  )

describe('Might from passives', () => {
  it('applies while the source is on the board, and stops when it is not', () => {
    const state = scene([
      { id: 'captain', cardId: 'captain', owner: 0 },
      { id: 'ally', cardId: 'plain', owner: 0 },
    ])
    expect(might(state, 'ally')).toBe(5)
    const captain = state.objects.captain
    if (!captain) throw new Error('missing unit')
    const gone = {
      ...state,
      objects: { ...state.objects, captain: { ...captain, zone: 'trash' as const } },
    }
    expect(might(gone, 'ally')).toBe(4)
  })

  it('stacks from two sources', () => {
    const state = scene([
      { id: 'c1', cardId: 'captain', owner: 0 },
      { id: 'c2', cardId: 'captain', owner: 0 },
      { id: 'ally', cardId: 'plain', owner: 0 },
    ])
    expect(might(state, 'ally')).toBe(6)
    expect(might(state, 'c1')).toBe(4) // the other captain's aura only
  })

  it('refuses a passive that picks units by Might, which would chase its own tail', () => {
    const parsed = passiveEffectSchema.safeParse({
      kind: 'might',
      amount: 1,
      to: { kind: 'unit', might: { max: 3 } },
    })
    expect(parsed.success).toBe(false)
  })
})

describe('a Cleanup kills units under lethal damage (323.5)', () => {
  it('kills a unit left with lethal damage, as when an aura it relied on is gone', () => {
    // 4 damage on a plain 4 Might unit, with no aura to keep it alive.
    const state = scene([{ id: 'ally', cardId: 'plain', owner: 0, damage: 4 }])
    const events: GameEvent[] = []
    const settled = settleBoard(state, oracle, events)
    expect(settled.objects.ally?.zone).toBe('trash')
    expect(settled.players[0].trash).toEqual(['ally'])
    expect(events).toContainEqual({ type: 'killed', target: 'ally' })
  })

  it('leaves a unit alone while its Might still holds', () => {
    const state = scene([
      { id: 'captain', cardId: 'captain', owner: 0 },
      { id: 'ally', cardId: 'plain', owner: 0, damage: 4 },
    ])
    expect(settleBoard(state, oracle, []).objects.ally?.zone).toBe('battlefield')
  })
})

describe('Bonus Damage (712-715)', () => {
  const board = (gunners: number) =>
    scene([
      { id: 'src', cardId: 'plain', owner: 0 },
      ...Array.from({ length: gunners }, (_, i) => ({
        id: `gunner-${String(i)}`,
        cardId: 'gunner',
        owner: 0 as const,
      })),
      { id: 'foe', cardId: 'big', owner: 1 },
    ])

  it('adds to each Deal by its controller, summing every instance (714)', () => {
    expect(deal(board(0), 2).state.objects.foe?.damage).toBe(2)
    expect(deal(board(1), 2).state.objects.foe?.damage).toBe(3)
    expect(deal(board(2), 2).state.objects.foe?.damage).toBe(4)
  })

  it('does not apply when no damage is dealt (715.4)', () => {
    expect(deal(board(1), 0).state.objects.foe?.damage).toBe(0)
  })

  it("does not apply to the opponent's spells", () => {
    const state = scene([
      { id: 'src', cardId: 'plain', owner: 1 },
      { id: 'gunner', cardId: 'gunner', owner: 0 },
      { id: 'mine', cardId: 'big', owner: 0 },
    ])
    const result = beginExecution(
      state,
      {
        source: 'src',
        controller: 1,
        steps: [
          {
            op: 'for-each',
            of: { kind: 'unit', controller: 'opponent' },
            as: '$u',
            steps: [{ op: 'deal', amount: 2, target: '$u' }],
          },
        ],
      },
      oracle,
    )
    expect(result.state.objects.mine?.damage).toBe(2)
    // Its own controller's Bonus Damage does not help the opponent hit it either.
    expect(result.state.objects.gunner?.damage).toBe(2)
  })
})
