import { describe, expect, it } from 'vitest'

import { applyAction } from '../src/actions/index.js'
import { oracleFrom } from '../src/effects/oracle.js'
import type { CardFacts } from '../src/effects/oracle.js'
import { advanceFlow } from '../src/flow/phases.js'
import { findTriggers } from '../src/flow/triggers.js'
import type { GameState, PlayerId } from '../src/state/game-state.js'
import { makeState } from './support/state.js'

const unit = (might: number, abilities: CardFacts['abilities'] = []): CardFacts => ({
  type: 'unit',
  name: `Unit ${String(might)}`,
  domains: ['fury'],
  tags: [],
  might,
  keywords: [],
  cost: { energy: 1, power: [] },
  abilities,
})

const oracle = oracleFrom({
  // "When you play me, draw 1."
  scholar: unit(2, [
    { id: 'scholar-draw', kind: 'triggered', on: 'played', steps: [{ op: 'draw', amount: 1 }] },
  ]),
  // "When you play a spell that costs 5 or more, draw 1."
  sage: unit(2, [
    {
      id: 'sage-draw',
      kind: 'triggered',
      on: 'spell-played',
      condition: { kind: 'spell-cost-at-least', energy: 5 },
      steps: [{ op: 'draw', amount: 1 }],
    },
  ]),
  // "At the end of your turn, draw 1."
  owl: unit(1, [
    { id: 'owl-draw', kind: 'triggered', on: 'end-of-turn', steps: [{ op: 'draw', amount: 1 }] },
  ]),
  // "When I attack, deal 1 to an enemy unit here."
  corsair: unit(3, [
    {
      id: 'corsair-shot',
      kind: 'triggered',
      on: 'attack',
      steps: [
        { op: 'choose', as: '$t', from: { kind: 'unit', controller: 'opponent', at: 'here' } },
        { op: 'deal', amount: 1, target: '$t' },
      ],
    },
  ]),
  // Triggers, but the engine cannot run it.
  broken: unit(2, [
    { id: 'broken', kind: 'triggered', on: 'played', steps: [], notImplemented: 'not yet' },
  ]),
  legend: {
    type: 'legend',
    name: 'Commander',
    domains: ['fury'],
    tags: [],
    keywords: [],
    abilities: [
      {
        id: 'legend-conquer',
        kind: 'triggered',
        on: 'conquer',
        condition: { kind: 'units-at-battlefield-at-least', count: 2 },
        steps: [{ op: 'draw', amount: 2 }],
      },
    ],
  },
  cheap: {
    type: 'spell',
    name: 'Cheap',
    domains: ['fury'],
    tags: [],
    keywords: [],
    cost: { energy: 1, power: [] },
    abilities: [{ id: 'cheap', kind: 'spell', steps: [{ op: 'draw', amount: 0 }] }],
  },
  pricey: {
    type: 'spell',
    name: 'Pricey',
    domains: ['fury'],
    tags: [],
    keywords: [],
    cost: { energy: 5, power: [] },
    abilities: [{ id: 'pricey', kind: 'spell', steps: [{ op: 'draw', amount: 0 }] }],
  },
  filler: unit(1),
  field: { type: 'battlefield', name: 'Field', domains: [], tags: [], keywords: [], abilities: [] },
})

function inMain(
  specs: Parameters<typeof makeState>[0],
  energy = 10,
  overrides: Partial<GameState> = {},
): GameState {
  const deck = Array.from({ length: 6 }, (_, i) => ({
    id: `deck-${String(i)}`,
    cardId: 'filler',
    owner: 0 as const,
    zone: 'mainDeck' as const,
  }))
  const base = makeState([...specs, ...deck], {
    phase: 'main',
    step: 'main',
    turnPlayer: 0,
    priority: 0,
    ...overrides,
  })
  return {
    ...base,
    players: {
      ...base.players,
      0: { ...base.players[0], runePool: { energy, power: {}, universal: 0, restricted: [] } },
    },
  }
}

function place(
  state: GameState,
  id: string,
  location: NonNullable<GameState['objects'][string]['location']>,
): GameState {
  const object = state.objects[id]
  if (!object) throw new Error(`no ${id}`)
  return {
    ...state,
    objects: {
      ...state.objects,
      [id]: { ...object, zone: location.kind === 'base' ? 'base' : 'battlefield', location },
    },
  }
}

/** Both players pass until the Chain is empty. */
function passUntilEmpty(state: GameState): GameState {
  let current = state
  for (let i = 0; i < 20 && current.chain.length > 0; i += 1) {
    const player = current.priority as PlayerId
    const result = applyAction(current, { type: 'pass', player }, oracle)
    if (!result.ok) throw new Error(result.error.message)
    current = result.state
  }
  return current
}

const handSize = (state: GameState, player: PlayerId = 0) => state.players[player].hand.length

describe('Play Effects (383.4.a)', () => {
  it('trigger once the unit is on the board, and resolve after both players pass', () => {
    const state = inMain([{ id: 'u', cardId: 'scholar', owner: 0, zone: 'hand' }])
    const played = applyAction(state, { type: 'play-card', player: 0, card: 'u' }, oracle)
    if (!played.ok) throw new Error(played.error.message)

    // The unit is already in base; its trigger waits on the Chain for Priority.
    expect(played.state.objects.u?.zone).toBe('base')
    expect(played.state.chain).toHaveLength(1)
    expect(played.state.chain[0]).toMatchObject({ source: 'u', abilityId: 'scholar-draw' })
    expect(played.state.priority).toBe(0)

    const resolved = passUntilEmpty(played.state)
    expect(handSize(resolved)).toBe(1)
    expect(resolved.chain).toHaveLength(0)
  })

  it('never put an ability the engine cannot run on the Chain', () => {
    const state = inMain([{ id: 'u', cardId: 'broken', owner: 0, zone: 'hand' }])
    const played = applyAction(state, { type: 'play-card', player: 0, card: 'u' }, oracle)
    if (!played.ok) throw new Error(played.error.message)
    expect(played.state.chain).toHaveLength(0)
  })
})

describe('conditions are part of the trigger (383.2.a.1)', () => {
  it('triggers on a spell that meets the cost, and resolves before the spell', () => {
    const state = inMain([
      { id: 'sage', cardId: 'sage', owner: 0, zone: 'base' },
      { id: 's', cardId: 'pricey', owner: 0, zone: 'hand' },
    ])
    const withSage = place(state, 'sage', { kind: 'base', player: 0 })
    const played = applyAction(withSage, { type: 'play-card', player: 0, card: 's' }, oracle)
    if (!played.ok) throw new Error(played.error.message)

    // The spell, then the trigger above it: newest resolves first.
    expect(played.state.chain.map((c) => c.abilityId ?? 'spell')).toEqual(['spell', 'sage-draw'])
    expect(handSize(passUntilEmpty(played.state))).toBe(1)
  })

  it('does not trigger at all for a spell that costs less', () => {
    const state = inMain([
      { id: 'sage', cardId: 'sage', owner: 0, zone: 'base' },
      { id: 's', cardId: 'cheap', owner: 0, zone: 'hand' },
    ])
    const played = applyAction(
      place(state, 'sage', { kind: 'base', player: 0 }),
      { type: 'play-card', player: 0, card: 's' },
      oracle,
    )
    if (!played.ok) throw new Error(played.error.message)
    expect(played.state.chain.map((c) => c.abilityId ?? 'spell')).toEqual(['spell'])
  })

  it('does not trigger for the opponent’s spell', () => {
    const state = inMain([
      { id: 'sage', cardId: 'sage', owner: 1, zone: 'base' },
      { id: 's', cardId: 'pricey', owner: 0, zone: 'hand' },
    ])
    const played = applyAction(
      place(state, 'sage', { kind: 'base', player: 1 }),
      { type: 'play-card', player: 0, card: 's' },
      oracle,
    )
    if (!played.ok) throw new Error(played.error.message)
    expect(played.state.chain.some((c) => c.abilityId === 'sage-draw')).toBe(false)
  })
})

describe('end of turn', () => {
  it('stops the turn at the Ending step, resolves, then carries on to the next turn', () => {
    const state = place(inMain([{ id: 'owl', cardId: 'owl', owner: 0, zone: 'base' }]), 'owl', {
      kind: 'base',
      player: 0,
    })
    const ended = applyAction(state, { type: 'pass', player: 0 }, oracle)
    if (!ended.ok) throw new Error(ended.error.message)

    expect(ended.state).toMatchObject({ phase: 'ending', step: 'ending', turnNumber: 1 })
    expect(ended.state.chain[0]).toMatchObject({ abilityId: 'owl-draw', controller: 0 })

    const after = passUntilEmpty(ended.state)
    expect(handSize(after)).toBe(1)
    // The Ending step's task does not run twice: the turn moved on.
    expect(after.turnNumber).toBe(2)
    expect(after.turnPlayer).toBe(1)
  })

  it('only fires on its controller’s turn', () => {
    const state = place(inMain([{ id: 'owl', cardId: 'owl', owner: 1, zone: 'base' }]), 'owl', {
      kind: 'base',
      player: 1,
    })
    const ended = applyAction(state, { type: 'pass', player: 0 }, oracle)
    if (!ended.ok) throw new Error(ended.error.message)
    expect(ended.state.chain).toHaveLength(0)
    expect(ended.state.turnNumber).toBe(2)
  })

  it('puts nothing on the Chain when the cards in play have no abilities', () => {
    const state = place(
      inMain([{ id: 'owl', cardId: 'owl', owner: 0, zone: 'base' }], 0, {
        phase: 'ending',
        step: 'ending',
        stepTaskDone: false,
        priority: null,
      }),
      'owl',
      { kind: 'base', player: 0 },
    )
    // The same board, read through card data with no abilities on it at all.
    const vanilla = oracleFrom({ owl: unit(1, []) })
    expect(advanceFlow(state, vanilla).state.chain).toHaveLength(0)
  })
})

describe('Conquer and Attack', () => {
  function fieldState(): GameState {
    const state = inMain([
      { id: 'bf-0', cardId: 'field', owner: 0, zone: 'battlefield' },
      { id: 'leg', cardId: 'legend', owner: 0, zone: 'legendZone' },
      { id: 'a', cardId: 'filler', owner: 0, zone: 'base' },
      { id: 'b', cardId: 'filler', owner: 0, zone: 'base' },
    ])
    return place(place(state, 'a', { kind: 'base', player: 0 }), 'b', { kind: 'base', player: 0 })
  }

  it('fires a Legend’s conquer trigger when its condition holds', () => {
    const moved = applyAction(
      fieldState(),
      { type: 'move', player: 0, units: ['a', 'b'], to: { kind: 'battlefield', id: 'bf-0' } },
      oracle,
    )
    if (!moved.ok) throw new Error(moved.error.message)
    expect(moved.state.players[0].points).toBe(1)
    expect(moved.state.chain[0]).toMatchObject({ source: 'leg', abilityId: 'legend-conquer' })
    expect(handSize(passUntilEmpty(moved.state))).toBe(2)
  })

  it('does not fire it when too few units conquered', () => {
    const moved = applyAction(
      fieldState(),
      { type: 'move', player: 0, units: ['a'], to: { kind: 'battlefield', id: 'bf-0' } },
      oracle,
    )
    if (!moved.ok) throw new Error(moved.error.message)
    expect(moved.state.players[0].points).toBe(1)
    expect(moved.state.chain).toHaveLength(0)
  })

  it('fires an attack trigger when a combat begins', () => {
    const state = inMain([
      { id: 'bf-0', cardId: 'field', owner: 0, zone: 'battlefield' },
      { id: 'corsair', cardId: 'corsair', owner: 0, zone: 'base' },
      { id: 'enemy', cardId: 'filler', owner: 1, zone: 'battlefield' },
    ])
    const ready = place(place(state, 'corsair', { kind: 'base', player: 0 }), 'enemy', {
      kind: 'battlefield',
      id: 'bf-0',
    })
    const moved = applyAction(
      ready,
      { type: 'move', player: 0, units: ['corsair'], to: { kind: 'battlefield', id: 'bf-0' } },
      oracle,
    )
    if (!moved.ok) throw new Error(moved.error.message)
    expect(moved.state.showdown?.combat).toBe(true)
    expect(moved.state.chain[0]).toMatchObject({ source: 'corsair', abilityId: 'corsair-shot' })
  })
})

describe('ordering simultaneous triggers (383.3.d.1)', () => {
  it('puts the Turn Player’s triggers first', () => {
    const state = inMain([
      { id: 'mine', cardId: 'owl', owner: 0, zone: 'base' },
      { id: 'theirs', cardId: 'owl', owner: 1, zone: 'base' },
    ])
    const hits = findTriggers(
      state,
      [
        { type: 'turn-ending', player: 1 },
        { type: 'turn-ending', player: 0 },
      ],
      oracle,
    )
    expect(hits.map((h) => h.controller)).toEqual([0, 1])
  })
})
