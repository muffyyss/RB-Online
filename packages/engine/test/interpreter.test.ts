import { describe, expect, it } from 'vitest'

import type { EffectStep } from '../src/effects/steps.js'
import { beginExecution, resolveChoice } from '../src/effects/interpreter.js'
import { oracleFrom } from '../src/effects/oracle.js'
import type { GameState, ObjectId } from '../src/state/game-state.js'
import { makeState } from './support/state.js'

const oracle = oracleFrom({
  'unit-2': {
    type: 'unit',
    name: 'Small',
    domains: ['fury'],
    tags: ['Demacia'],
    might: 2,
    keywords: [],
    abilities: [],
  },
  'unit-5': {
    type: 'unit',
    name: 'Big',
    domains: ['fury'],
    tags: [],
    might: 5,
    keywords: [],
    abilities: [],
  },
  spell: { type: 'spell', name: 'Zap', domains: ['fury'], tags: [], keywords: [], abilities: [] },
  rune: { type: 'rune', name: 'Rune', domains: ['fury'], tags: [], keywords: [], abilities: [] },
})

/** Put a unit on a battlefield so location-aware selectors have something to find. */
function onBattlefield(id: ObjectId, cardId: string, owner: 0 | 1) {
  return { id, cardId, owner, zone: 'battlefield' as const }
}

function withLocations(state: GameState, ids: readonly ObjectId[]): GameState {
  const objects = { ...state.objects }
  for (const id of ids) {
    const object = objects[id]
    if (object) objects[id] = { ...object, location: { kind: 'battlefield', id: 'bf-0' } }
  }
  return { ...state, objects }
}

const run = (state: GameState, steps: readonly EffectStep[], controller: 0 | 1 = 0) =>
  beginExecution(state, { source: 'src', controller, steps }, oracle)

describe('interpreter — damage and death (143.2.a)', () => {
  it('marks damage without killing when it is below Might', () => {
    const state = withLocations(
      makeState([onBattlefield('u', 'unit-5', 1), { id: 'src', owner: 0, zone: 'battlefield' }]),
      ['u'],
    )
    const result = run(state, [{ op: 'deal', amount: 2, target: { kind: 'unit' } }])
    expect(result.status).toBe('done')
    expect(result.state.objects.u?.damage).toBe(2)
    expect(result.state.objects.u?.zone).toBe('battlefield')
  })

  it('kills when damage equals Might', () => {
    const state = withLocations(
      makeState([onBattlefield('u', 'unit-2', 1), { id: 'src', owner: 0, zone: 'battlefield' }]),
      ['u'],
    )
    const result = run(state, [{ op: 'deal', amount: 2, target: { kind: 'unit' } }])
    expect(result.state.objects.u?.zone).toBe('trash')
    expect(result.events).toContainEqual({ type: 'killed', target: 'u' })
  })

  it('counts buffs toward Might, so a buffed unit survives (703)', () => {
    const state = withLocations(
      makeState([
        { ...onBattlefield('u', 'unit-2', 1), buffs: 1 },
        { id: 'src', owner: 0, zone: 'battlefield' },
      ]),
      ['u'],
    )
    const result = run(state, [{ op: 'deal', amount: 2, target: { kind: 'unit' } }])
    expect(result.state.objects.u?.zone).toBe('battlefield')
    expect(result.state.objects.u?.damage).toBe(2)
  })

  it('clears damage and buffs when a unit leaves play (705)', () => {
    const state = withLocations(
      makeState([
        { ...onBattlefield('u', 'unit-2', 1), buffs: 3 },
        { id: 'src', owner: 0, zone: 'battlefield' },
      ]),
      ['u'],
    )
    const result = run(state, [{ op: 'kill', target: { kind: 'unit' } }])
    expect(result.state.objects.u).toMatchObject({ zone: 'trash', buffs: 0, damage: 0 })
    expect(result.state.objects.u?.location).toBeUndefined()
  })
})

describe('interpreter — targeting suspends rather than blocking', () => {
  const state = withLocations(
    makeState([
      onBattlefield('a', 'unit-5', 1),
      onBattlefield('b', 'unit-5', 1),
      { id: 'src', owner: 0, zone: 'battlefield' },
    ]),
    ['a', 'b'],
  )
  const steps: EffectStep[] = [
    { op: 'choose', as: '$victim', from: { kind: 'unit', controller: 'opponent' } },
    { op: 'deal', amount: 3, target: '$victim' },
  ]

  it('stops at the choice with both candidates offered', () => {
    const result = run(state, steps)
    expect(result.status).toBe('awaiting-choice')
    expect(result.state.pendingChoice).toMatchObject({
      player: 0,
      binding: '$victim',
      candidates: ['a', 'b'],
    })
    // Nothing has happened yet — no damage before the player has decided.
    expect(result.state.objects.a?.damage).toBe(0)
  })

  it('resumes at the following step once answered', () => {
    const suspended = run(state, steps)
    if (suspended.status !== 'awaiting-choice') throw new Error('expected a choice')

    const done = resolveChoice(suspended.state, suspended.execution, '$victim', ['b'], oracle)
    expect(done.status).toBe('done')
    expect(done.state.objects.b?.damage).toBe(3)
    expect(done.state.objects.a?.damage).toBe(0)
    expect(done.state.pendingChoice).toBeNull()
  })

  it('skips the dependent step when nothing can be chosen (054)', () => {
    // "Do as much as you can, ignoring impossible instructions."
    const empty = makeState([{ id: 'src', owner: 0, zone: 'battlefield' }])
    const result = run(empty, steps)
    expect(result.status).toBe('done')
    expect(result.events).toContainEqual({
      type: 'effect-skipped',
      reason: 'no-targets',
      detail: '$victim',
    })
  })
})

describe('interpreter — selectors', () => {
  const state = withLocations(
    makeState([
      onBattlefield('mine', 'unit-5', 0),
      onBattlefield('theirs', 'unit-5', 1),
      { id: 'src', owner: 0, zone: 'battlefield' },
    ]),
    ['mine', 'theirs'],
  )

  it('respects controller', () => {
    const result = run(state, [
      { op: 'buff', amount: 1, target: { kind: 'unit', controller: 'self' } },
    ])
    expect(result.state.objects.mine?.buffs).toBe(1)
    expect(result.state.objects.theirs?.buffs).toBe(0)
  })

  it('does not treat runes as permanents (161.1.a)', () => {
    const withRune = withLocations(
      makeState([
        { id: 'r', cardId: 'rune', owner: 0, zone: 'base' },
        { id: 'src', owner: 0, zone: 'battlefield' },
      ]),
      [],
    )
    const asPermanent = run(withRune, [{ op: 'exhaust', target: { kind: 'permanent' } }])
    expect(asPermanent.state.objects.r?.exhausted).toBe(false)

    const asRune = run(withRune, [{ op: 'exhaust', target: { kind: 'rune' } }])
    expect(asRune.state.objects.r?.exhausted).toBe(true)
  })

  it('filters by tag', () => {
    const tagged = withLocations(
      makeState([
        onBattlefield('demacian', 'unit-2', 0),
        onBattlefield('other', 'unit-5', 0),
        { id: 'src', owner: 0, zone: 'battlefield' },
      ]),
      ['demacian', 'other'],
    )
    const result = run(tagged, [
      { op: 'buff', amount: 1, target: { kind: 'unit', tag: 'Demacia', count: 5 } },
    ])
    expect(result.state.objects.demacian?.buffs).toBe(1)
    expect(result.state.objects.other?.buffs).toBe(0)
  })
})

describe('interpreter — for-each', () => {
  it('runs its body once per matching object', () => {
    const state = withLocations(
      makeState([
        onBattlefield('a', 'unit-5', 0),
        onBattlefield('b', 'unit-5', 0),
        { id: 'src', owner: 0, zone: 'battlefield' },
      ]),
      ['a', 'b'],
    )
    const result = run(state, [
      {
        op: 'for-each',
        of: { kind: 'unit', controller: 'self', count: 5 },
        as: '$ally',
        steps: [{ op: 'buff', amount: 1, target: '$ally' }],
      },
    ])
    expect(result.status).toBe('done')
    expect(result.state.objects.a?.buffs).toBe(1)
    expect(result.state.objects.b?.buffs).toBe(1)
  })
})

describe('interpreter — draw and Burn Out (431)', () => {
  it('draws from the top of the deck', () => {
    const state = makeState([
      { id: 'c1', owner: 0, zone: 'mainDeck' },
      { id: 'c2', owner: 0, zone: 'mainDeck' },
      { id: 'src', owner: 0, zone: 'battlefield' },
    ])
    const result = run(state, [{ op: 'draw', amount: 1 }])
    expect(result.state.players[0].hand).toHaveLength(1)
    expect(result.state.players[0].mainDeck).toHaveLength(1)
  })

  it('burns out on an empty deck, giving the opponent a point (431.2.c)', () => {
    const state = makeState([
      { id: 'dead', owner: 0, zone: 'trash' },
      { id: 'src', owner: 0, zone: 'battlefield' },
    ])
    const result = run(state, [{ op: 'draw', amount: 1 }])

    expect(result.events).toContainEqual({ type: 'burned-out', player: 0, gavePointTo: 1 })
    expect(result.state.players[1].points).toBe(1)
    // Trash was recycled into the deck, then one card drawn from it (431.2.b, d).
    expect(result.state.players[0].trash).toHaveLength(0)
    expect(result.state.players[0].hand).toEqual(['dead'])
  })

  it('does not loop forever when the deck and trash are both empty (431.3)', () => {
    const state = makeState([{ id: 'src', owner: 0, zone: 'battlefield' }])
    const result = run(state, [{ op: 'draw', amount: 3 }])
    expect(result.status).toBe('done')
    expect(result.state.players[1].points).toBe(1)
  })
})

describe('interpreter — resources', () => {
  it('adds Energy and Power to the Rune Pool (166.1)', () => {
    const state = makeState([{ id: 'src', owner: 0, zone: 'base' }])
    const result = run(state, [{ op: 'add', energy: 2, power: ['fury'], universal: 1 }])
    expect(result.state.players[0].runePool).toEqual({
      energy: 2,
      power: { fury: 1 },
      universal: 1,
      restricted: [],
    })
  })

  it('keeps restricted resources in their own bucket', () => {
    const state = makeState([{ id: 'src', owner: 0, zone: 'base' }])
    const result = run(state, [{ op: 'add', energy: 2, onlyFor: ['spell'] }])
    const pool = result.state.players[0].runePool
    // Not folded into the general total, because whether it can pay depends on
    // what is being paid for.
    expect(pool.energy).toBe(0)
    expect(pool.restricted).toEqual([{ energy: 2, power: {}, universal: 0, onlyFor: ['spell'] }])
  })

  it('refuses unimplemented ops instead of silently doing nothing', () => {
    const state = makeState([{ id: 'src', owner: 0, zone: 'base' }])
    const result = run(state, [{ op: 'channel', amount: 2 }])
    expect(result.events).toContainEqual({
      type: 'effect-skipped',
      reason: 'not-implemented',
      detail: 'channel',
    })
  })
})

describe('interpreter — determinism', () => {
  it('produces identical results for identical input', () => {
    const build = () =>
      withLocations(
        makeState([
          onBattlefield('a', 'unit-2', 1),
          { id: 'd1', owner: 0, zone: 'mainDeck' },
          { id: 'src', owner: 0, zone: 'battlefield' },
        ]),
        ['a'],
      )
    const steps: EffectStep[] = [
      { op: 'deal', amount: 1, target: { kind: 'unit', controller: 'opponent' } },
      { op: 'draw', amount: 1 },
    ]
    const first = run(build(), steps)
    const second = run(build(), steps)
    expect(JSON.stringify(first.state)).toBe(JSON.stringify(second.state))
    expect(first.events).toEqual(second.events)
  })
})
