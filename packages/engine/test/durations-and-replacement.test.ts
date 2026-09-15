import { describe, expect, it } from 'vitest'

import { beginExecution } from '../src/effects/interpreter.js'
import { mightOf } from '../src/effects/might.js'
import { oracleFrom } from '../src/effects/oracle.js'
import type { CardFacts } from '../src/effects/oracle.js'
import type { EffectStep } from '../src/effects/steps.js'
import { settleBoard } from '../src/flow/cleanup.js'
import { advanceFlow } from '../src/flow/phases.js'
import type { GameState, Location } from '../src/state/game-state.js'
import { makeState } from './support/state.js'

const unit = (might: number, keywords: CardFacts['keywords'] = []): CardFacts => ({
  type: 'unit',
  name: `Unit ${String(might)}`,
  domains: ['fury'],
  tags: [],
  might,
  keywords,
  abilities: [],
})

const oracle = oracleFrom({ m3: unit(3), m5: unit(5) })

const BF0: Location = { kind: 'battlefield', id: 'bf-0' }

function scene(specs: readonly { id: string; cardId: string; owner: 0 | 1 }[]): GameState {
  const state = makeState([
    { id: 'src', cardId: 'm3', owner: 0, zone: 'base' },
    ...specs.map((s) => ({ ...s, zone: 'battlefield' as const })),
  ])
  const objects = { ...state.objects }
  for (const s of specs) {
    const object = objects[s.id]
    if (object) objects[s.id] = { ...object, location: BF0 }
  }
  return { ...state, objects }
}

const run = (state: GameState, steps: readonly EffectStep[], targets = {}) =>
  beginExecution(state, { source: 'src', controller: 0, steps, targets }, oracle)

const protect: EffectStep = {
  op: 'recall-instead-of-dying',
  target: '$unit',
  duration: 'this-turn',
}
const killIt: EffectStep = { op: 'kill', target: '$unit' }

describe('recall instead of dying (438)', () => {
  it('replaces the next death with a recall, exhausted, and only that one', () => {
    const state = scene([{ id: 'u', cardId: 'm3', owner: 0 }])
    const once = run(state, [protect, killIt], { $unit: ['u'] })
    expect(once.state.objects.u).toMatchObject({
      zone: 'base',
      location: { kind: 'base', player: 0 },
      exhausted: true,
    })
    expect(once.events).toContainEqual({ type: 'recalled', unit: 'u' })
    expect(once.events.some((event) => event.type === 'killed')).toBe(false)

    const twice = run(once.state, [killIt], { $unit: ['u'] })
    expect(twice.state.objects.u?.zone).toBe('trash')
  })

  it('leaves damage in place (458.1), so lethal damage kills it at the next Cleanup', () => {
    const state = scene([{ id: 'u', cardId: 'm3', owner: 0 }])
    const hit = run(state, [protect, { op: 'deal', amount: 3, target: '$unit' }], { $unit: ['u'] })
    expect(hit.state.objects.u).toMatchObject({ zone: 'base', damage: 3 })
    expect(settleBoard(hit.state, oracle, []).objects.u?.zone).toBe('trash')
  })

  it('expires with the turn (317.2.c)', () => {
    const state = scene([{ id: 'u', cardId: 'm3', owner: 0 }])
    const protectedUnit = run(state, [protect], { $unit: ['u'] }).state
    const next = advanceFlow(
      {
        ...protectedUnit,
        phase: 'ending',
        step: 'expiration',
        stepTaskDone: false,
        priority: null,
      },
      oracle,
    ).state
    expect(next.objects.u).not.toHaveProperty('recallInsteadOfDying')
  })
})

describe('keywords given this combat', () => {
  it('count toward Might while they apply, and add to printed values (814.2)', () => {
    const state = scene([{ id: 'u', cardId: 'm3', owner: 0 }])
    const shielded = run(
      state,
      [
        {
          op: 'grant-keyword',
          keyword: 'shield',
          value: 2,
          target: '$unit',
          duration: 'this-combat',
        },
        { op: 'grant-keyword', keyword: 'shield', target: '$unit', duration: 'this-combat' },
      ],
      { $unit: ['u'] },
    ).state
    const u = shielded.objects.u
    if (!u) throw new Error('missing unit')
    expect(u.keywordsThisCombat).toEqual({ shield: 3 })
    expect(mightOf(shielded, { ...u, combatRole: 'defender' }, oracle)).toBe(6)
    expect(mightOf(shielded, u, oracle)).toBe(3) // not defending
  })
})

describe('deal-each-other', () => {
  const duel: EffectStep = { op: 'deal-each-other', a: '$a', b: '$b' }

  it('deals each unit the other’s Might, worked out before either is dealt', () => {
    const state = scene([
      { id: 'a', cardId: 'm5', owner: 0 },
      { id: 'b', cardId: 'm3', owner: 1 },
    ])
    const result = run(state, [duel], { $a: ['a'], $b: ['b'] })
    expect(result.state.objects.b?.zone).toBe('trash')
    expect(result.state.objects.a?.damage).toBe(3) // b still dealt its 3
  })

  it('does nothing if either unit is gone', () => {
    const state = scene([{ id: 'a', cardId: 'm5', owner: 0 }])
    const result = run(state, [duel], { $a: ['a'], $b: [] })
    expect(result.state.objects.a?.damage).toBe(0)
  })
})

describe('Might with no duration', () => {
  it('lasts past the end of the turn, and goes when the unit leaves the board', () => {
    const state = scene([{ id: 'u', cardId: 'm3', owner: 0 }])
    const given = run(
      state,
      [{ op: 'give-might', amount: 2, target: '$unit', duration: 'while-on-board' }],
      { $unit: ['u'] },
    ).state
    const next = advanceFlow(
      { ...given, phase: 'ending', step: 'expiration', stepTaskDone: false, priority: null },
      oracle,
    ).state
    const u = next.objects.u
    expect(u && mightOf(next, u, oracle)).toBe(5)
    const gone = run(next, [killIt], { $unit: ['u'] }).state
    expect(gone.objects.u).not.toHaveProperty('mightWhileOnBoard')
  })
})
