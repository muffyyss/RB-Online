/**
 * Fighting with real cards: move attackers in, let both players pass, and
 * return the board after the Combat has resolved.
 */

import type { GameEvent, GameState, ObjectId, PlayerId } from '@rb/engine'
import { applyAction } from '@rb/engine'

import { act, oracle } from './game.js'

export function attackInto(
  state: GameState,
  units: readonly ObjectId[],
  battlefield: 'bf-0' | 'bf-1',
): { readonly state: GameState; readonly events: readonly GameEvent[] } {
  let current = act(state, {
    type: 'move',
    player: state.turnPlayer,
    units,
    to: { kind: 'battlefield', id: battlefield },
  })
  const events: GameEvent[] = []
  for (let i = 0; i < 10 && current.showdown; i += 1) {
    const result = applyAction(
      current,
      { type: 'pass', player: current.priority as PlayerId },
      oracle,
    )
    if (!result.ok) throw new Error(`pass refused: ${result.error.message}`)
    events.push(...result.events)
    current = result.state
  }
  if (current.showdown) throw new Error('combat did not end')
  return { state: current, events }
}

/**
 * Finish a combat that is already open: answer any choice with `choose`, pass
 * otherwise, until the showdown closes.
 */
export function fightOut(
  state: GameState,
  choose: (candidates: readonly ObjectId[]) => readonly ObjectId[] = (c) => c.slice(0, 1),
): GameState {
  let current = state
  for (let i = 0; i < 40 && current.showdown; i += 1) {
    const choice = current.pendingChoice
    current = choice
      ? act(current, {
          type: 'resolve-choice',
          player: choice.player,
          chosen: choose(choice.candidates),
        })
      : act(current, { type: 'pass', player: current.priority as PlayerId })
  }
  if (current.showdown) throw new Error('combat did not end')
  return current
}
