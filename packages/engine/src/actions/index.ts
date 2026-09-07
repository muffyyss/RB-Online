/**
 * Actions — the only way the outside world changes the game.
 *
 * `applyAction` is the engine's entire write surface. The server validates every
 * incoming action through it and never trusts a client's claim about whose turn
 * it is; the client runs the same function over its redacted view to predict
 * locally. A rejected action returns a `RuleViolation` rather than throwing, so
 * an illegal move is ordinary data the server can log and reply with.
 */

import type { GameEvent } from '../effects/events.js'
import type { CardOracle } from '../effects/oracle.js'
import { advanceChain, passOnChain, resumeResolution } from '../flow/chain.js'
import { advanceFlow, checkWin, endMainPhase, VICTORY_SCORE } from '../flow/phases.js'
import type { GameState, ObjectId, PlayerId } from '../state/game-state.js'
import { opponentOf } from '../state/game-state.js'

export type GameAction =
  /** Decline to act. With an empty Chain in the Main Phase this ends the turn (316.9). */
  | { readonly type: 'pass'; readonly player: PlayerId }
  /** Answer a suspended effect's choice. */
  | {
      readonly type: 'resolve-choice'
      readonly player: PlayerId
      readonly chosen: readonly ObjectId[]
    }
  /** A player may concede at any time (650). */
  | { readonly type: 'concede'; readonly player: PlayerId }

export interface RuleViolation {
  readonly code:
    | 'not-your-priority'
    | 'not-your-choice'
    | 'game-over'
    | 'choice-pending'
    | 'wrong-selection-count'
    | 'invalid-selection'
  readonly message: string
}

export type ActionResult =
  | { readonly ok: true; readonly state: GameState; readonly events: readonly GameEvent[] }
  | { readonly ok: false; readonly error: RuleViolation }

const reject = (code: RuleViolation['code'], message: string): ActionResult => ({
  ok: false,
  error: { code, message },
})

/**
 * Apply one action.
 *
 * Deterministic: the same state, action and card data always produce the same
 * result. All randomness comes from the RNG carried inside the state.
 */
export function applyAction(
  state: GameState,
  action: GameAction,
  oracle: CardOracle,
): ActionResult {
  if (state.winner !== null) {
    return reject('game-over', 'the game has already been won')
  }

  switch (action.type) {
    case 'concede': {
      // 650 - a player may concede at any time. The opponent wins immediately.
      const winner = opponentOf(action.player)
      const events: GameEvent[] = [{ type: 'game-won', player: winner }]
      return {
        ok: true,
        state: { ...state, winner, priority: null, focus: null },
        events,
      }
    }

    case 'resolve-choice': {
      const pending = state.pendingChoice
      if (!pending) return reject('not-your-choice', 'no choice is pending')
      if (pending.player !== action.player) {
        return reject('not-your-choice', 'this choice belongs to the other player')
      }
      if (action.chosen.length < pending.min || action.chosen.length > pending.max) {
        return reject(
          'wrong-selection-count',
          `expected between ${String(pending.min)} and ${String(pending.max)} selections`,
        )
      }
      // Never trust the selection: it must come from the candidate list the
      // engine offered, or a client could target something illegal.
      for (const id of action.chosen) {
        if (!pending.candidates.includes(id)) {
          return reject('invalid-selection', `${id} was not offered as a candidate`)
        }
      }
      const suspended = state.resolving
      if (!suspended) {
        return reject('not-your-choice', 'no suspended effect to resume')
      }

      // The answer fills the binding the `choose` step was waiting on.
      const resumed = resumeResolution(
        {
          ...state,
          resolving: {
            ...suspended,
            bindings: { ...suspended.bindings, [pending.binding]: action.chosen },
          },
        },
        { ...suspended, bindings: { ...suspended.bindings, [pending.binding]: action.chosen } },
        oracle,
      )
      const advanced =
        resumed.state.chain.length === 0 && resumed.state.pendingChoice === null
          ? advanceFlow(resumed.state)
          : { state: resumed.state, events: [] as readonly GameEvent[] }
      return {
        ok: true,
        state: advanced.state,
        events: [...resumed.events, ...advanced.events],
      }
    }

    case 'pass': {
      if (state.pendingChoice) {
        return reject('choice-pending', 'a choice must be answered first')
      }
      if (state.priority !== action.player) {
        return reject('not-your-priority', 'you do not have priority')
      }

      // With a Chain in play, passing feeds the FEPR loop (338.1.b, 339).
      if (state.chain.length > 0) {
        const passed = passOnChain(state)
        const drained = advanceChain(passed, oracle)
        // Chain emptied: hand control back to the phase machine.
        const after =
          drained.state.chain.length === 0 && drained.state.pendingChoice === null
            ? advanceFlow(drained.state)
            : { state: drained.state, events: [] as readonly GameEvent[] }
        return {
          ok: true,
          state: after.state,
          events: [...drained.events, ...after.events],
        }
      }

      // An empty Chain in the Main Phase: passing ends the turn (316.9).
      const events: GameEvent[] = []
      const ended = endMainPhase(state)
      const advanced = advanceFlow(checkWin(ended, events))
      return { ok: true, state: advanced.state, events: [...events, ...advanced.events] }
    }
  }
}

/**
 * Everything the player may legally do right now.
 *
 * The client uses this to highlight options without a round-trip; the server
 * uses it to check that an incoming action was one of them.
 */
export function legalActions(state: GameState, player: PlayerId): readonly GameAction[] {
  if (state.winner !== null) return []

  if (state.pendingChoice) {
    return state.pendingChoice.player === player
      ? [{ type: 'resolve-choice', player, chosen: [] }]
      : []
  }

  const actions: GameAction[] = [{ type: 'concede', player }]
  if (state.priority === player) actions.push({ type: 'pass', player })
  return actions
}

export { VICTORY_SCORE }
