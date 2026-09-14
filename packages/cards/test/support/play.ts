/**
 * Running a card's real steps through the real interpreter.
 *
 * A test that only compares a card's data to itself proves nothing about
 * whether the card works. For every ability the engine can run, the card's
 * test resolves it against a board and checks what happened.
 */

import { beginExecution, resolveChoice } from '@rb/engine'
import type { ExecutionResult, GameState, ObjectId } from '@rb/engine'

import type { CardDefinition } from '../../src/schema.js'
import { cardOracle } from '../../src/oracle.js'
import { makeState } from '../../../engine/test/support/state.js'

const oracle = cardOracle()

export interface Piece {
  readonly id: ObjectId
  readonly cardId: string
  readonly owner: 0 | 1
  /** A battlefield id, or 'base'. */
  readonly at: string
}

/** A board with battlefields `bf-0` and `bf-1` and the given units on it. */
export function board(pieces: readonly Piece[]): GameState {
  const specs = [
    { id: 'bf-0', cardId: 'OGS-003', owner: 0 as const, zone: 'battlefield' as const },
    { id: 'bf-1', cardId: 'OGS-003', owner: 1 as const, zone: 'battlefield' as const },
    ...pieces.map((p) => ({
      id: p.id,
      cardId: p.cardId,
      owner: p.owner,
      zone: p.at === 'base' ? ('base' as const) : ('battlefield' as const),
    })),
  ]
  const state = makeState(specs)
  const objects = { ...state.objects }
  for (const piece of pieces) {
    const object = objects[piece.id]
    if (!object) continue
    objects[piece.id] = {
      ...object,
      location:
        piece.at === 'base'
          ? { kind: 'base', player: piece.owner }
          : { kind: 'battlefield', id: piece.at },
    }
  }
  // The battlefield placeholders must look like battlefields to selectors.
  return { ...state, objects }
}

/** An oracle that also knows the two placeholder battlefields. */
export const testOracle = {
  facts(cardId: string) {
    if (cardId === 'battlefield') {
      return {
        type: 'battlefield' as const,
        name: 'Field',
        domains: [],
        tags: [],
        keywords: [],
        abilities: [],
      }
    }
    return oracle.facts(cardId)
  },
}

/**
 * Resolve a card's spell effect, answering each choice in order.
 *
 * Throws if the effect asks for more choices than were supplied, so a test
 * cannot pass by stopping early.
 */
export function resolveSpell(
  card: CardDefinition,
  state: GameState,
  choices: readonly (readonly ObjectId[])[],
  controller: 0 | 1 = 0,
): ExecutionResult {
  const effect = card.abilities?.find((a) => a.kind === 'spell')
  if (!effect) throw new Error(`${card.id} has no spell effect`)
  const withSource = {
    ...state,
    objects: {
      ...state.objects,
      src: {
        id: 'src',
        cardId: card.id,
        owner: controller,
        controller,
        zone: 'chain' as const,
        exhausted: false,
        damage: 0,
        buffs: 0,
        faceDown: false,
      },
    },
  }
  let result = beginExecution(
    withBattlefieldCards(withSource),
    { source: 'src', controller, steps: effect.steps },
    testOracle,
  )
  for (const choice of choices) {
    if (result.status !== 'awaiting-choice') throw new Error('effect finished before every choice')
    const binding = result.state.pendingChoice?.binding ?? ''
    result = resolveChoice(result.state, result.execution, binding, choice, testOracle)
  }
  if (result.status === 'awaiting-choice') throw new Error('effect still waiting for a choice')
  return result
}

function withBattlefieldCards(state: GameState): GameState {
  const objects = { ...state.objects }
  for (const id of ['bf-0', 'bf-1']) {
    const object = objects[id]
    if (object) objects[id] = { ...object, cardId: 'battlefield' }
  }
  return { ...state, objects }
}
