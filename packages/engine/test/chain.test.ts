import { describe, expect, it } from 'vitest'

import { applyAction } from '../src/actions/index.js'
import { oracleFrom } from '../src/effects/oracle.js'
import { addToChain, advanceChain } from '../src/flow/chain.js'
import type { GameState } from '../src/state/game-state.js'
import { turnStateOf } from '../src/state/game-state.js'
import { makeState } from './support/state.js'

const oracle = oracleFrom({
  // A spell that deals 1 to a chosen enemy unit.
  bolt: {
    type: 'spell',
    name: 'Bolt',
    domains: ['fury'],
    tags: [],
    keywords: [],
    abilities: [
      {
        id: 'bolt-effect',
        kind: 'spell',
        steps: [
          { op: 'choose', as: '$victim', from: { kind: 'unit', controller: 'opponent' } },
          { op: 'deal', amount: 1, target: '$victim' },
        ],
      },
    ],
  },
  // A spell with no choices, so it resolves in one go.
  gift: {
    type: 'spell',
    name: 'Gift',
    domains: ['fury'],
    tags: [],
    keywords: [],
    abilities: [{ id: 'gift-effect', kind: 'spell', steps: [{ op: 'draw', amount: 1 }] }],
  },
  soldier: {
    type: 'unit',
    name: 'Soldier',
    domains: ['fury'],
    tags: [],
    might: 3,
    keywords: [],
    abilities: [],
  },
  // An ability that Adds resources — the other case in 337.2.
  crystal: {
    type: 'gear',
    name: 'Crystal',
    domains: ['fury'],
    tags: [],
    keywords: [],
    abilities: [{ id: 'crystal-add', kind: 'activated', steps: [{ op: 'add', energy: 1 }] }],
  },
})

function board(): GameState {
  return makeState([
    { id: 'target', cardId: 'soldier', owner: 1, zone: 'battlefield' },
    { id: 'my-unit', cardId: 'soldier', owner: 0, zone: 'hand' },
    { id: 'bolt-1', cardId: 'bolt', owner: 0, zone: 'hand' },
    { id: 'gift-1', cardId: 'gift', owner: 0, zone: 'hand' },
    { id: 'deck-1', cardId: 'gift', owner: 0, zone: 'mainDeck' },
    { id: 'crystal-1', cardId: 'crystal', owner: 0, zone: 'base' },
  ])
}

/** Put a card from hand on the Chain the way playing it does: it leaves the hand. */
function cast(state: GameState, source: string): GameState {
  const object = state.objects[source]
  if (!object) throw new Error(`no ${source}`)
  const owner = state.players[object.owner]
  return addToChain(
    {
      ...state,
      objects: { ...state.objects, [source]: { ...object, zone: 'chain' } },
      players: {
        ...state.players,
        [object.owner]: { ...owner, hand: owner.hand.filter((id) => id !== source) },
      },
    },
    { source, controller: object.owner },
  )
}

describe('the Chain exists only while it holds something (330)', () => {
  it('closes the turn state when an item is added', () => {
    const state = addToChain(board(), { source: 'gift-1', controller: 0 })
    expect(turnStateOf(state)).toBe('neutral-closed')
    expect(state.chain).toHaveLength(1)
    expect(state.chain[0]?.pending).toBe(true)
  })

  it('resets the pass count whenever an item is added (339.1)', () => {
    const passed: GameState = { ...board(), consecutivePasses: 1 }
    expect(addToChain(passed, { source: 'gift-1', controller: 0 }).consecutivePasses).toBe(0)
  })
})

describe('337.2 — permanents and resource abilities resolve immediately', () => {
  it('puts a unit onto the board without anyone getting priority', () => {
    const state = addToChain(board(), { source: 'my-unit', controller: 0 })
    const { state: after } = advanceChain(state, oracle)

    expect(after.chain).toHaveLength(0)
    expect(after.objects['my-unit']?.zone).toBe('base')
    expect(after.players[0].hand).not.toContain('my-unit')
    // 143.4 - units enter the board exhausted.
    expect(after.objects['my-unit']?.exhausted).toBe(true)
    // Nobody was offered a window to respond.
    expect(after.priority).toBeNull()
  })

  it('resolves an ability that Adds resources immediately', () => {
    const state = addToChain(board(), {
      source: 'crystal-1',
      controller: 0,
      abilityId: 'crystal-add',
    })
    const { state: after } = advanceChain(state, oracle)
    expect(after.chain).toHaveLength(0)
    expect(after.players[0].runePool.energy).toBe(1)
  })

  it('does NOT resolve a spell immediately — it waits for priority', () => {
    const state = addToChain(board(), { source: 'gift-1', controller: 0 })
    const { state: after } = advanceChain(state, oracle)
    expect(after.chain).toHaveLength(1)
    expect(after.chain[0]?.pending).toBe(false) // finalized, not resolved
    expect(after.priority).toBe(0)
  })
})

describe('FEPR — passing resolves the newest item (339.1, 340.1)', () => {
  it('resolves once both players have passed in sequence', () => {
    const state = addToChain(board(), { source: 'gift-1', controller: 0 })
    const { state: withPriority } = advanceChain(state, oracle)

    const first = applyAction(withPriority, { type: 'pass', player: 0 }, oracle)
    if (!first.ok) throw new Error('first pass rejected')
    // One pass is not enough — the opponent still has a window.
    expect(first.state.chain).toHaveLength(1)
    expect(first.state.priority).toBe(1)

    const second = applyAction(first.state, { type: 'pass', player: 1 }, oracle)
    if (!second.ok) throw new Error('second pass rejected')
    expect(second.state.chain).toHaveLength(0)
    expect(second.state.players[0].hand).toContain('deck-1') // the draw happened
  })

  it('sends a resolved spell to its owner trash (133.4.b.1)', () => {
    const state = cast(board(), 'gift-1')
    const { state: withPriority } = advanceChain(state, oracle)
    const first = applyAction(withPriority, { type: 'pass', player: 0 }, oracle)
    if (!first.ok) throw new Error('rejected')
    const second = applyAction(first.state, { type: 'pass', player: 1 }, oracle)
    if (!second.ok) throw new Error('rejected')

    expect(second.state.objects['gift-1']?.zone).toBe('trash')
    expect(second.state.players[0].trash).toContain('gift-1')
  })

  it('resolves newest-first when two items are stacked (340.1)', () => {
    // Bolt goes on first, Gift on top. Gift must resolve before Bolt.
    const state = cast(cast(board(), 'bolt-1'), 'gift-1')
    const { state: aiming } = advanceChain(state, oracle)
    // Bolt picks its target as it goes on the Chain (355.5).
    const aimed = applyAction(
      aiming,
      { type: 'resolve-choice', player: 0, chosen: ['target'] },
      oracle,
    )
    if (!aimed.ok) throw new Error('rejected')
    const ready = aimed.state
    expect(ready.chain.map((c) => c.source)).toEqual(['bolt-1', 'gift-1'])

    const first = applyAction(ready, { type: 'pass', player: 0 }, oracle)
    if (!first.ok) throw new Error('rejected')
    const second = applyAction(first.state, { type: 'pass', player: 1 }, oracle)
    if (!second.ok) throw new Error('rejected')

    // Gift resolved; Bolt is still on the chain waiting.
    expect(second.state.objects['gift-1']?.zone).toBe('trash')
    expect(second.state.chain.map((c) => c.source)).toEqual(['bolt-1'])
  })
})

describe('targets are chosen as an item goes on the Chain (355.5)', () => {
  /** Bolt on the Chain, waiting for its target. */
  const aiming = () => advanceChain({ ...cast(board(), 'bolt-1'), priority: null }, oracle).state

  it('asks for the target while finalizing, before anyone has Priority', () => {
    const state = aiming()
    expect(state.pendingChoice).toMatchObject({
      player: 0,
      binding: '$victim',
      candidates: ['target'],
      item: state.chain[0]?.id,
    })
    expect(state.chain[0]?.pending).toBe(true)
    expect(state.priority).toBeNull()
    expect(state.resolving).toBeNull()
  })

  it('keeps the target on the item, where the opponent can see it before reacting', () => {
    const answered = applyAction(
      aiming(),
      { type: 'resolve-choice', player: 0, chosen: ['target'] },
      oracle,
    )
    if (!answered.ok) throw new Error('rejected')
    expect(answered.state.chain[0]).toMatchObject({
      pending: false,
      bindings: { $victim: ['target'] },
    })
    expect(answered.state.priority).toBe(0)
    expect(answered.state.objects.target?.damage).toBe(0) // nothing happens yet
  })

  it('resolves against the chosen target once both players pass, without asking again', () => {
    const answered = applyAction(
      aiming(),
      { type: 'resolve-choice', player: 0, chosen: ['target'] },
      oracle,
    )
    if (!answered.ok) throw new Error('rejected')
    const first = applyAction(answered.state, { type: 'pass', player: 0 }, oracle)
    if (!first.ok) throw new Error('rejected')
    const second = applyAction(first.state, { type: 'pass', player: 1 }, oracle)
    if (!second.ok) throw new Error('rejected')

    expect(second.state.pendingChoice).toBeNull()
    expect(second.state.objects.target?.damage).toBe(1)
    expect(second.state.chain).toHaveLength(0)
    expect(second.state.objects['bolt-1']?.zone).toBe('trash')
  })

  it('leaves a target unaffected if it stopped being legal before resolving (359.3.e)', () => {
    const answered = applyAction(
      aiming(),
      { type: 'resolve-choice', player: 0, chosen: ['target'] },
      oracle,
    )
    if (!answered.ok) throw new Error('rejected')
    // In response, control of the target changes: it is no longer an enemy unit.
    const target = answered.state.objects.target
    if (!target) throw new Error('missing target')
    const switched = {
      ...answered.state,
      objects: { ...answered.state.objects, target: { ...target, controller: 0 as const } },
    }
    const first = applyAction(switched, { type: 'pass', player: 0 }, oracle)
    if (!first.ok) throw new Error('rejected')
    const second = applyAction(first.state, { type: 'pass', player: 1 }, oracle)
    if (!second.ok) throw new Error('rejected')

    expect(second.state.objects.target?.damage).toBe(0)
    expect(second.state.objects['bolt-1']?.zone).toBe('trash') // it still resolved
  })

  it('refuses a selection that was never offered', () => {
    // 'my-unit' is in hand and was never a candidate.
    const bad = applyAction(
      aiming(),
      { type: 'resolve-choice', player: 0, chosen: ['my-unit'] },
      oracle,
    )
    expect(bad.ok).toBe(false)
    if (bad.ok) return
    expect(bad.error.code).toBe('invalid-selection')
  })

  it('refuses a pass while a target is being chosen', () => {
    const bad = applyAction(aiming(), { type: 'pass', player: 0 }, oracle)
    expect(bad.ok).toBe(false)
    if (bad.ok) return
    expect(bad.error.code).toBe('choice-pending')
  })

  it('refuses to play a spell with nothing to target (355.8)', () => {
    const state = makeState([{ id: 'bolt-1', cardId: 'bolt', owner: 0, zone: 'hand' }], {
      priority: 0,
    })
    const result = applyAction(state, { type: 'play-card', player: 0, card: 'bolt-1' }, oracle)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('no-targets')
  })
})

describe('abilities the DSL cannot express are refused, not half-run', () => {
  it('skips a notImplemented ability and reports why', () => {
    const flagged = oracleFrom({
      broken: {
        type: 'spell',
        name: 'Broken',
        domains: ['fury'],
        tags: [],
        keywords: [],
        abilities: [
          {
            id: 'broken-effect',
            kind: 'spell',
            steps: [{ op: 'draw', amount: 1 }],
            notImplemented: 'the spending restriction is not modelled',
          },
        ],
      },
    })
    const state = addToChain(makeState([{ id: 'b', cardId: 'broken', owner: 0, zone: 'hand' }]), {
      source: 'b',
      controller: 0,
    })
    // A spell finalizes and then waits for priority; it only reaches resolution
    // once both players have passed, which is where notImplemented is checked.
    const { state: ready } = advanceChain(state, flagged)
    const first = applyAction(ready, { type: 'pass', player: 0 }, flagged)
    if (!first.ok) throw new Error('rejected')
    const second = applyAction(first.state, { type: 'pass', player: 1 }, flagged)
    if (!second.ok) throw new Error('rejected')

    expect(second.state.chain).toHaveLength(0)
    expect(second.events.some((e) => e.type === 'effect-skipped')).toBe(true)
    // The draw must NOT have happened.
    const after = second.state
    expect(after.players[0].hand).toEqual(['b'])
  })
})
