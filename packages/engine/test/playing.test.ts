import { describe, expect, it } from 'vitest'

import { applyAction, legalActions } from '../src/actions/index.js'
import { oracleFrom } from '../src/effects/oracle.js'
import type { GameState, PlayerId } from '../src/state/game-state.js'
import { makeState } from './support/state.js'

const oracle = oracleFrom({
  // 2 Energy, no keywords: a plain sorcery-speed spell.
  gift: {
    type: 'spell',
    name: 'Gift',
    domains: ['fury'],
    tags: [],
    keywords: [],
    cost: { energy: 2, power: [] },
    abilities: [{ id: 'gift-effect', kind: 'spell', steps: [{ op: 'draw', amount: 1 }] }],
  },
  // [Action]: playable during a showdown too (308.1.a).
  incinerate: {
    type: 'spell',
    name: 'Incinerate',
    domains: ['fury'],
    tags: [],
    keywords: ['action'],
    cost: { energy: 2, power: [] },
    abilities: [{ id: 'inc-effect', kind: 'spell', steps: [{ op: 'draw', amount: 1 }] }],
  },
  // [Reaction]: the only thing playable while a Chain exists (309.1.a).
  counterspell: {
    type: 'spell',
    name: 'Counterspell',
    domains: ['fury'],
    tags: [],
    keywords: ['reaction'],
    cost: { energy: 1, power: [] },
    abilities: [{ id: 'cs-effect', kind: 'spell', steps: [{ op: 'draw', amount: 1 }] }],
  },
  soldier: {
    type: 'unit',
    name: 'Soldier',
    domains: ['fury'],
    tags: [],
    might: 3,
    keywords: [],
    cost: { energy: 3, power: [{ kind: 'domain', domain: 'fury' }] },
    abilities: [],
  },
  // Lux: exhaust for 2 Energy usable only on spells.
  lux: {
    type: 'unit',
    name: 'Lux',
    domains: ['order'],
    tags: [],
    might: 2,
    keywords: [],
    cost: { energy: 4, power: [] },
    abilities: [
      {
        id: 'lux-ramp',
        kind: 'activated',
        exhaust: true,
        keywords: ['reaction'],
        steps: [{ op: 'add', energy: 2, onlyFor: ['spell'] }],
      },
    ],
  },
})

function inMain(overrides: Partial<GameState> = {}, energy = 0): GameState {
  const base = makeState(
    [
      { id: 'gift-1', cardId: 'gift', owner: 0, zone: 'hand' },
      { id: 'inc-1', cardId: 'incinerate', owner: 0, zone: 'hand' },
      { id: 'cs-1', cardId: 'counterspell', owner: 0, zone: 'hand' },
      { id: 'soldier-1', cardId: 'soldier', owner: 0, zone: 'hand' },
      { id: 'lux-1', cardId: 'lux', owner: 0, zone: 'base' },
      { id: 'deck-1', cardId: 'gift', owner: 0, zone: 'mainDeck' },
      { id: 'deck-2', cardId: 'gift', owner: 0, zone: 'mainDeck' },
    ],
    { phase: 'main', step: 'main', turnPlayer: 0, priority: 0, ...overrides },
  )
  return {
    ...base,
    players: {
      ...base.players,
      0: { ...base.players[0], runePool: { energy, power: {}, universal: 0, restricted: [] } },
    },
  }
}

describe('playing a card (349-358)', () => {
  it('moves the card to the chain and pays its cost', () => {
    const result = applyAction(
      inMain({}, 2),
      { type: 'play-card', player: 0, card: 'gift-1' },
      oracle,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // The spell resolved (nobody could respond in this setup once both passed),
    // but the cost came out of the pool either way.
    expect(result.state.players[0].runePool.energy).toBe(0)
    expect(result.state.players[0].hand).not.toContain('gift-1')
  })

  it('refuses a card the player cannot pay for (444.2.a)', () => {
    const result = applyAction(
      inMain({}, 1),
      { type: 'play-card', player: 0, card: 'gift-1' },
      oracle,
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('cannot-pay')
  })

  it('leaves the state untouched when a play is refused (358.5)', () => {
    const before = inMain({}, 1)
    const result = applyAction(before, { type: 'play-card', player: 0, card: 'gift-1' }, oracle)
    expect(result.ok).toBe(false)
    // Nothing moved, nothing was spent.
    expect(before.players[0].hand).toContain('gift-1')
    expect(before.players[0].runePool.energy).toBe(1)
  })

  it('refuses a card that is not in your hand', () => {
    const result = applyAction(
      inMain({}, 5),
      { type: 'play-card', player: 0, card: 'lux-1' },
      oracle,
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('not-in-hand')
  })

  it('requires both Energy and Power for a unit (163.1, 163.2)', () => {
    // Soldier costs [3][R]; Energy alone is not enough.
    const energyOnly = applyAction(
      inMain({}, 3),
      { type: 'play-card', player: 0, card: 'soldier-1' },
      oracle,
    )
    expect(energyOnly.ok).toBe(false)

    const withPower = inMain({}, 3)
    const funded: GameState = {
      ...withPower,
      players: {
        ...withPower.players,
        0: {
          ...withPower.players[0],
          runePool: { energy: 3, power: { fury: 1 }, universal: 0, restricted: [] },
        },
      },
    }
    const ok = applyAction(funded, { type: 'play-card', player: 0, card: 'soldier-1' }, oracle)
    expect(ok.ok).toBe(true)
    if (!ok.ok) return
    // 337.2 - a unit resolves immediately, entering the board exhausted (143.4).
    expect(ok.state.objects['soldier-1']?.zone).toBe('base')
    expect(ok.state.objects['soldier-1']?.exhausted).toBe(true)
  })
})

describe('timing permissions (308.1.a, 309.1.a, 310.1.a)', () => {
  it('refuses a play from the player without priority', () => {
    const result = applyAction(
      inMain({}, 5),
      { type: 'play-card', player: 1, card: 'gift-1' },
      oracle,
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.message).toBe('no-priority')
  })

  it('refuses a plain card outside your own Main Phase (310.1.a)', () => {
    const theirTurn = inMain({ turnPlayer: 1, priority: 0 }, 5)
    const result = applyAction(theirTurn, { type: 'play-card', player: 0, card: 'gift-1' }, oracle)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.message).toBe('not-your-main')
  })

  it('allows only Reaction while a Chain exists (309.1.a)', () => {
    const closed = inMain(
      { chain: [{ id: 'c1', controller: 1, source: 'x', pending: false, bindings: {} }] },
      5,
    )
    const plain = applyAction(closed, { type: 'play-card', player: 0, card: 'gift-1' }, oracle)
    expect(plain.ok).toBe(false)
    if (!plain.ok) expect(plain.error.message).toBe('needs-reaction')

    const action = applyAction(closed, { type: 'play-card', player: 0, card: 'inc-1' }, oracle)
    expect(action.ok).toBe(false) // [Action] is not enough inside a Chain

    const reaction = applyAction(closed, { type: 'play-card', player: 0, card: 'cs-1' }, oracle)
    expect(reaction.ok).toBe(true)
  })

  it('allows Action or Reaction during a Showdown (308.1.a)', () => {
    const showdown = inMain({ showdown: { battlefield: 'bf-0', combat: true } }, 5)
    const plain = applyAction(showdown, { type: 'play-card', player: 0, card: 'gift-1' }, oracle)
    expect(plain.ok).toBe(false)
    if (!plain.ok) expect(plain.error.message).toBe('needs-action')

    const action = applyAction(showdown, { type: 'play-card', player: 0, card: 'inc-1' }, oracle)
    expect(action.ok).toBe(true)
  })
})

describe('activating an ability (376, 398-406)', () => {
  it('exhausts the source and adds restricted resources', () => {
    const result = applyAction(
      inMain(),
      { type: 'activate-ability', player: 0, source: 'lux-1', abilityId: 'lux-ramp' },
      oracle,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.objects['lux-1']?.exhausted).toBe(true)
    expect(result.state.players[0].runePool.restricted).toEqual([
      { energy: 2, power: {}, universal: 0, onlyFor: ['spell'] },
    ])
  })

  it('refuses to exhaust something already exhausted', () => {
    const state = inMain()
    const exhausted: GameState = {
      ...state,
      objects: { ...state.objects, 'lux-1': { ...state.objects['lux-1']!, exhausted: true } },
    }
    const result = applyAction(
      exhausted,
      { type: 'activate-ability', player: 0, source: 'lux-1', abilityId: 'lux-ramp' },
      oracle,
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('already-exhausted')
  })

  it('lets the restricted Energy pay for a spell, end to end', () => {
    const ramped = applyAction(
      inMain(),
      { type: 'activate-ability', player: 0, source: 'lux-1', abilityId: 'lux-ramp' },
      oracle,
    )
    if (!ramped.ok) throw new Error('activate rejected')

    const spell = applyAction(
      ramped.state,
      { type: 'play-card', player: 0, card: 'gift-1' },
      oracle,
    )
    expect(spell.ok).toBe(true)
    if (!spell.ok) return
    expect(spell.state.players[0].runePool.restricted).toEqual([])
  })

  it('will NOT let the restricted Energy pay for a unit', () => {
    const ramped = applyAction(
      inMain(),
      { type: 'activate-ability', player: 0, source: 'lux-1', abilityId: 'lux-ramp' },
      oracle,
    )
    if (!ramped.ok) throw new Error('activate rejected')

    // Soldier is a unit, so the spell-only Energy does not apply to it.
    const unit = applyAction(
      ramped.state,
      { type: 'play-card', player: 0, card: 'soldier-1' },
      oracle,
    )
    expect(unit.ok).toBe(false)
    if (unit.ok) return
    expect(unit.error.code).toBe('cannot-pay')
  })
})

describe('legalActions', () => {
  const playable = (state: GameState, player: PlayerId = 0) =>
    legalActions(state, player, oracle)
      .filter((a) => a.type === 'play-card')
      .map((a) => (a.type === 'play-card' ? a.card : ''))

  it('offers only affordable cards', () => {
    expect(playable(inMain({}, 0))).toEqual([])
    expect(playable(inMain({}, 1))).toEqual(['cs-1'])
    expect(playable(inMain({}, 2))).toEqual(['gift-1', 'inc-1', 'cs-1'])
  })

  it('offers nothing to the player without priority', () => {
    expect(legalActions(inMain({}, 5), 1, oracle).map((a) => a.type)).toEqual(['concede'])
  })

  it('narrows to Reaction cards inside a Chain', () => {
    const closed = inMain(
      { chain: [{ id: 'c1', controller: 1, source: 'x', pending: false, bindings: {} }] },
      5,
    )
    expect(playable(closed)).toEqual(['cs-1'])
  })

  it('offers an activated ability while its source is ready', () => {
    const actions = legalActions(inMain(), 0, oracle)
    expect(actions).toContainEqual({
      type: 'activate-ability',
      player: 0,
      source: 'lux-1',
      abilityId: 'lux-ramp',
    })
  })
})
