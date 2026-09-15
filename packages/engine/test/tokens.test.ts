import { describe, expect, it } from 'vitest'

import { beginExecution, resolveChoice, runExecution } from '../src/effects/interpreter.js'
import { oracleFrom } from '../src/effects/oracle.js'
import type { CardFacts } from '../src/effects/oracle.js'
import { resolveSelector } from '../src/effects/selector.js'
import type { EffectStep } from '../src/effects/steps.js'
import { settleBoard } from '../src/flow/cleanup.js'
import type { GameState, ObjectId } from '../src/state/game-state.js'
import { makeState } from './support/state.js'

const card = (type: CardFacts['type'], extra: Partial<CardFacts> = {}): CardFacts => ({
  type,
  name: type,
  domains: [],
  tags: [],
  keywords: [],
  abilities: [],
  ...extra,
})

const oracle = oracleFrom({
  recruit: card('unit', { name: 'Recruit', tags: ['Recruit'], might: 1, token: true }),
  unit: card('unit', { might: 3 }),
  field: card('battlefield'),
})

/** Player 0's source `src` in base, and the two battlefield cards. */
function scene(
  controllers: readonly [0 | 1 | undefined, 0 | 1 | undefined] = [undefined, undefined],
) {
  const state = makeState([
    { id: 'src', cardId: 'unit', owner: 0, zone: 'base' },
    { id: 'bf-0', cardId: 'field', owner: 0, zone: 'battlefield' },
    { id: 'bf-1', cardId: 'field', owner: 1, zone: 'battlefield' },
  ])
  return {
    ...state,
    battlefields: state.battlefields.map((bf, i) => {
      const controller = controllers[i]
      return controller === undefined ? bf : { ...bf, controller }
    }),
  }
}

const run = (state: GameState, steps: readonly EffectStep[]) =>
  beginExecution(state, { source: 'src', controller: 0, steps }, oracle)

const tokensIn = (state: GameState): readonly ObjectId[] =>
  Object.values(state.objects)
    .filter((object) => object.token)
    .map((object) => object.id)

const playOne: EffectStep = { op: 'play-token', token: 'recruit', to: 'base' }

describe('playing tokens (439, 185)', () => {
  it("creates tokens with fresh ids, controlled and owned by the effect's controller", () => {
    const result = run(scene(), [{ op: 'play-token', token: 'recruit', count: 2, to: 'base' }])
    const ids = tokensIn(result.state)
    expect(ids).toHaveLength(2)
    expect(new Set(ids).size).toBe(2)
    for (const id of ids) {
      expect(result.state.objects[id]).toMatchObject({
        owner: 0,
        controller: 0,
        zone: 'base',
        exhausted: true,
        token: true,
      })
      expect(result.state.players[0].base).toContain(id)
      expect(result.events).toContainEqual({ type: 'played', player: 0, card: id })
    }
  })

  it("enters ready when its player's units are entering ready", () => {
    const state = scene()
    const player = { ...state.players[0], unitsEnterReadyThisTurn: true }
    const played = run({ ...state, players: { ...state.players, 0: player } }, [playOne]).state
    const [id] = tokensIn(played)
    expect(id && played.objects[id]?.exhausted).toBe(false)
  })

  it('goes to a bound battlefield only while its player controls it, else to base', () => {
    const toChosen: readonly EffectStep[] = [
      { op: 'choose', as: '$where', from: { kind: 'battlefield' } },
      { op: 'play-token', token: 'recruit', to: '$where' },
    ]
    const place = (state: GameState, chosen: string) => {
      const asked = run(state, toChosen)
      if (asked.status !== 'awaiting-choice') throw new Error('expected a choice')
      const done = resolveChoice(asked.state, asked.execution, '$where', [chosen], oracle)
      const [id] = tokensIn(done.state)
      return id === undefined ? undefined : done.state.objects[id]?.location
    }
    expect(place(scene([0, 1]), 'bf-0')).toEqual({ kind: 'battlefield', id: 'bf-0' })
    expect(place(scene([0, 1]), 'bf-1')).toEqual({ kind: 'base', player: 0 })
  })
})

describe('a token leaving the board ceases to exist (186.1)', () => {
  it('when killed by an effect', () => {
    const result = run(scene(), [playOne, { op: 'kill', target: { kind: 'unit', tag: 'Recruit' } }])
    expect(tokensIn(result.state)).toEqual([])
    expect(result.state.players[0].trash).toEqual([])
    expect(result.state.players[0].base).toEqual(['src'])
  })

  it('when returned to hand', () => {
    const result = run(scene(), [
      playOne,
      { op: 'return-to-hand', target: { kind: 'unit', tag: 'Recruit' } },
    ])
    expect(tokensIn(result.state)).toEqual([])
    expect(result.state.players[0].hand).toEqual([])
  })

  it('when a Cleanup kills it', () => {
    const played = run(scene(), [playOne]).state
    const [id] = tokensIn(played)
    const token = id === undefined ? undefined : played.objects[id]
    if (!id || !token) throw new Error('no token')
    const hurt = { ...played, objects: { ...played.objects, [id]: { ...token, damage: 1 } } }
    const settled = settleBoard(hurt, oracle, [])
    expect(tokensIn(settled)).toEqual([])
    expect(settled.players[0].trash).toEqual([])
  })
})

describe('what tokens needed along the way', () => {
  it('a battlefield is controlled by whoever holds it, not by whoever brought the card (190)', () => {
    const ctx = { controller: 0 as const, source: 'src', oracle }
    const mine = resolveSelector(scene([1, 0]), { kind: 'battlefield', controller: 'self' }, ctx)
    expect(mine).toEqual(['bf-1'])
    expect(resolveSelector(scene(), { kind: 'battlefield', controller: 'self' }, ctx)).toEqual([])
  })

  it('repeat runs its steps that many times', () => {
    const result = run(scene(), [{ op: 'repeat', times: 3, steps: [playOne] }])
    expect(tokensIn(result.state)).toHaveLength(3)
  })

  it('a choice with nothing to offer empties its binding, so a loop cannot reuse an old answer', () => {
    // As if an earlier pass had chosen bf-0, which nobody controls now.
    const result = runExecution(
      scene(),
      {
        source: 'src',
        controller: 0,
        bindings: { $where: ['bf-0'] },
        frames: [
          {
            index: 0,
            steps: [
              { op: 'choose', as: '$where', from: { kind: 'battlefield', controller: 'self' } },
              { op: 'play-token', token: 'recruit', to: '$where' },
            ],
          },
        ],
      },
      oracle,
    )
    const [id] = tokensIn(result.state)
    expect(id && result.state.objects[id]?.location).toEqual({ kind: 'base', player: 0 })
  })
})
