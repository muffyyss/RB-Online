import { describe, expect, it } from 'vitest'

import { beginExecution } from '../src/effects/interpreter.js'
import { oracleFrom } from '../src/effects/oracle.js'
import type { CardFacts } from '../src/effects/oracle.js'
import { resolveSelector } from '../src/effects/selector.js'
import type { EffectStep } from '../src/effects/steps.js'
import type { GameState } from '../src/state/game-state.js'
import { makeState } from './support/state.js'

const card = (type: CardFacts['type'], might?: number): CardFacts => ({
  type,
  name: type,
  domains: ['fury'],
  tags: [],
  ...(might === undefined ? {} : { might }),
  keywords: [],
  abilities: [],
})

const oracle = oracleFrom({ unit: card('unit', 3), spell: card('spell'), rune: card('rune') })

const run = (state: GameState, steps: readonly EffectStep[]) =>
  beginExecution(state, { source: 'src', controller: 0, steps }, oracle)

describe('selecting from a zone', () => {
  const state = makeState([
    { id: 'src', cardId: 'unit', owner: 0, zone: 'base' },
    { id: 'dead-unit', cardId: 'unit', owner: 0, zone: 'trash' },
    { id: 'dead-spell', cardId: 'spell', owner: 0, zone: 'trash' },
    { id: 'their-dead', cardId: 'unit', owner: 1, zone: 'trash' },
    { id: 'in-hand', cardId: 'unit', owner: 0, zone: 'hand' },
  ])
  const ctx = { controller: 0 as const, source: 'src', oracle }

  it('finds only that zone, of that kind, belonging to that player', () => {
    expect(
      resolveSelector(state, { kind: 'unit', controller: 'self', zone: 'trash' }, ctx),
    ).toEqual(['dead-unit'])
    expect(
      resolveSelector(state, { kind: 'spell', controller: 'self', zone: 'trash' }, ctx),
    ).toEqual(['dead-spell'])
    expect(resolveSelector(state, { kind: 'card', controller: 'self', zone: 'hand' }, ctx)).toEqual(
      ['in-hand'],
    )
  })

  it('still means the board when no zone is named (141.1.b.2)', () => {
    expect(resolveSelector(state, { kind: 'unit' }, ctx)).toEqual(['src'])
  })
})

describe('return-to-hand, discard and channel', () => {
  it('returns a unit on the board to its owner’s hand, clearing its board state', () => {
    const state = makeState([
      { id: 'src', cardId: 'unit', owner: 0, zone: 'base' },
      { id: 'u', cardId: 'unit', owner: 1, zone: 'battlefield', damage: 2, buffs: 1 },
    ])
    const result = run(state, [
      { op: 'return-to-hand', target: { kind: 'unit', controller: 'opponent' } },
    ])
    expect(result.state.objects.u).toMatchObject({ zone: 'hand', damage: 0, buffs: 0 })
    expect(result.state.players[1].hand).toEqual(['u'])
    expect(result.events).toContainEqual({ type: 'returned-to-hand', target: 'u' })
  })

  it('discards only cards that are in hand (422)', () => {
    const state = makeState([
      { id: 'src', cardId: 'unit', owner: 0, zone: 'base' },
      { id: 'h', cardId: 'spell', owner: 0, zone: 'hand' },
    ])
    const result = run(state, [
      { op: 'discard', target: { kind: 'card', controller: 'self', zone: 'hand' } },
      { op: 'discard', target: '$me' },
    ])
    expect(result.state.players[0].hand).toEqual([])
    expect(result.state.players[0].trash).toEqual(['h'])
    expect(result.state.objects.src?.zone).toBe('base')
    expect(result.events).toContainEqual({ type: 'discarded', player: 0, cards: ['h'] })
  })

  it('channels runes exhausted when told to, and fewer when the Rune Deck is short (430.3)', () => {
    const state = makeState([
      { id: 'src', cardId: 'unit', owner: 0, zone: 'base' },
      { id: 'r1', cardId: 'rune', owner: 0, zone: 'runeDeck' },
    ])
    const result = run(state, [{ op: 'channel', amount: 2, exhausted: true }])
    expect(result.state.objects.r1).toMatchObject({
      zone: 'base',
      location: { kind: 'base', player: 0 },
      exhausted: true,
    })
    expect(result.state.players[0].runeDeck).toEqual([])
    expect(result.events).toContainEqual({ type: 'channeled', player: 0, runes: ['r1'] })
  })
})
