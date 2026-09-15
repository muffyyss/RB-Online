/**
 * Playing real cards through `applyAction`, the way a match does.
 *
 * For abilities that only happen as part of play — triggers, above all — a test
 * has to go through the same entry point the server uses, or it proves nothing
 * about whether the card works in a game.
 */

import { applyAction } from '@rb/engine'
import type {
  CardFacts,
  CardOracle,
  GameAction,
  GameState,
  Location,
  ObjectId,
  PlayerId,
  ZoneName,
} from '@rb/engine'

import { cardOracle } from '../../src/oracle.js'
import { makeState } from '../../../engine/test/support/state.js'

/** A battlefield with no abilities, so a scene's battlefields change nothing. */
export const PLAIN_BATTLEFIELD = 'plain-battlefield'

const plain: CardFacts = {
  type: 'battlefield',
  name: 'Plain Field',
  domains: [],
  tags: [],
  keywords: [],
  abilities: [],
}

const cards = cardOracle()

/** Every real card, plus the plain battlefield. */
export const oracle: CardOracle = {
  facts: (cardId) => (cardId === PLAIN_BATTLEFIELD ? plain : cards.facts(cardId)),
}

export interface Spec {
  readonly id: ObjectId
  readonly cardId: string
  readonly owner: PlayerId
  /** Where it is: a zone name, or a location on the board. */
  readonly at: 'hand' | 'mainDeck' | 'trash' | 'runeDeck' | 'legendZone' | Location
  readonly exhausted?: boolean
}

/**
 * Player 0's Main Phase with the given objects, two battlefields `bf-0` and
 * `bf-1`, a few cards in each deck to draw, and plenty of Energy and Power in
 * player 0's pool.
 *
 * The battlefields have no abilities unless a test names real ones, so that a
 * Battlefield's passive (Void Gate's Bonus Damage, say) never quietly changes
 * the numbers in a test about something else.
 */
export function mainPhase(
  specs: readonly Spec[],
  battlefields: readonly [string, string] = [PLAIN_BATTLEFIELD, PLAIN_BATTLEFIELD],
): GameState {
  const deck = (owner: PlayerId) =>
    Array.from({ length: 5 }, (_, i) => ({
      id: `deck-${String(owner)}-${String(i)}`,
      cardId: 'OGN-219',
      owner,
      zone: 'mainDeck' as const,
    }))
  const zoneOf = (spec: Spec): ZoneName =>
    typeof spec.at === 'string' ? spec.at : spec.at.kind === 'base' ? 'base' : 'battlefield'

  const state = makeState(
    [
      { id: 'bf-0', cardId: battlefields[0], owner: 0, zone: 'battlefield' },
      { id: 'bf-1', cardId: battlefields[1], owner: 1, zone: 'battlefield' },
      ...specs.map((s) => ({
        id: s.id,
        cardId: s.cardId,
        owner: s.owner,
        zone: zoneOf(s),
        ...(s.exhausted === undefined ? {} : { exhausted: s.exhausted }),
      })),
      ...deck(0),
      ...deck(1),
    ],
    { phase: 'main', step: 'main', turnPlayer: 0, priority: 0 },
  )

  const objects = { ...state.objects }
  for (const spec of specs) {
    const object = objects[spec.id]
    if (object && typeof spec.at !== 'string') objects[spec.id] = { ...object, location: spec.at }
  }
  const pool = {
    energy: 20,
    power: { fury: 3, chaos: 3, calm: 3, mind: 3, body: 3, order: 3 },
    universal: 0,
    restricted: [],
  }
  return {
    ...state,
    objects,
    players: { ...state.players, 0: { ...state.players[0], runePool: pool } },
  }
}

export function act(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action, oracle)
  if (!result.ok) throw new Error(`${action.type} refused: ${result.error.message}`)
  return result.state
}

/**
 * Pass until the Chain is empty, answering any choice with `choose` (by default
 * the first candidates, as few as allowed).
 */
export function settle(
  state: GameState,
  choose: (candidates: readonly ObjectId[], min: number) => readonly ObjectId[] = (c, min) =>
    c.slice(0, Math.max(min, 1)),
): GameState {
  let current = state
  for (let i = 0; i < 40; i += 1) {
    const choice = current.pendingChoice
    if (choice) {
      current = act(current, {
        type: 'resolve-choice',
        player: choice.player,
        chosen: choose(choice.candidates, choice.min),
      })
      continue
    }
    if (current.chain.length === 0) return current
    current = act(current, { type: 'pass', player: current.priority as PlayerId })
  }
  throw new Error('chain did not settle')
}

export const base = (player: PlayerId): Location => ({ kind: 'base', player })
export const field = (id: 'bf-0' | 'bf-1'): Location => ({ kind: 'battlefield', id })
