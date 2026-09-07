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
import { canPay, pay } from '../model/cost.js'
import { addToChain, advanceChain, passOnChain, resumeResolution } from '../flow/chain.js'
import { timingRefusal } from '../flow/timing.js'
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
  /** Play a card from hand (349-358). */
  | { readonly type: 'play-card'; readonly player: PlayerId; readonly card: ObjectId }
  /** Activate an ability of a permanent you control (376, 398-406). */
  | {
      readonly type: 'activate-ability'
      readonly player: PlayerId
      readonly source: ObjectId
      readonly abilityId: string
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
    | 'not-in-hand'
    | 'unknown-card'
    | 'bad-timing'
    | 'cannot-pay'
    | 'unknown-ability'
    | 'already-exhausted'
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

    case 'play-card': {
      if (state.pendingChoice) return reject('choice-pending', 'a choice must be answered first')
      // 312.1 - Priority is the exclusive right to take Discretionary Actions,
      // so it gates everything before any question about the card itself.
      if (state.priority !== action.player) return reject('bad-timing', 'no-priority')

      const object = state.objects[action.card]
      if (!object) return reject('unknown-card', `no such card: ${action.card}`)
      if (object.zone !== 'hand' || object.owner !== action.player) {
        return reject('not-in-hand', 'that card is not in your hand')
      }
      const facts = oracle.facts(object.cardId)
      if (!facts) return reject('unknown-card', `no card data for ${object.cardId}`)

      // 358.4 - the card must have permission to be played at this timing.
      const refusal = timingRefusal(state, action.player, facts.keywords)
      if (refusal) return reject('bad-timing', refusal)

      // 356 - Total Cost. Cost modifications (356.1-356.5) are not implemented;
      // no OGS card applies one. The base cost is the total for now.
      const cost = facts.cost ?? { energy: 0, power: [] }
      const pool = state.players[action.player].runePool
      const target = { cardType: facts.type }
      if (!canPay(cost, facts.domains, pool, target)) {
        return reject('cannot-pay', 'you cannot pay that cost')
      }
      const paid = pay(cost, facts.domains, pool, target)
      if (!paid) return reject('cannot-pay', 'you cannot pay that cost')

      // 354 - move the card to the Chain, which Closes the State. Cost is
      // settled before mutating rather than after, which is equivalent because
      // a failed legality check undoes the whole process anyway (358.5).
      const player = state.players[action.player]
      const moved: GameState = {
        ...state,
        objects: { ...state.objects, [action.card]: { ...object, zone: 'chain' } },
        players: {
          ...state.players,
          [action.player]: {
            ...player,
            hand: player.hand.filter((id) => id !== action.card),
            runePool: paid,
          },
        },
      }

      const queued = addToChain(moved, { source: action.card, controller: action.player })
      const drained = advanceChain({ ...queued, priority: null }, oracle)
      const after =
        drained.state.chain.length === 0 && drained.state.pendingChoice === null
          ? advanceFlow(drained.state)
          : { state: drained.state, events: [] as readonly GameEvent[] }
      return { ok: true, state: after.state, events: [...drained.events, ...after.events] }
    }

    case 'activate-ability': {
      if (state.pendingChoice) return reject('choice-pending', 'a choice must be answered first')
      if (state.priority !== action.player) return reject('bad-timing', 'no-priority')

      const source = state.objects[action.source]
      if (!source) return reject('unknown-card', `no such object: ${action.source}`)
      if (source.controller !== action.player) {
        return reject('not-in-hand', 'you do not control that object')
      }
      const facts = oracle.facts(source.cardId)
      const ability = facts?.abilities.find((a) => a.id === action.abilityId)
      if (!facts || !ability || ability.kind !== 'activated') {
        return reject('unknown-ability', `no activated ability ${action.abilityId}`)
      }

      const refusal = timingRefusal(state, action.player, ability.keywords ?? [])
      if (refusal) return reject('bad-timing', refusal)

      // 135.2.e.2 - the [E] symbol. An exhausted permanent cannot pay it again.
      if (ability.exhaust && source.exhausted) {
        return reject('already-exhausted', 'that permanent is already exhausted')
      }

      // An ability cost has no card being paid for, so restricted resources
      // cannot contribute to it.
      let pool = state.players[action.player].runePool
      if (ability.cost) {
        const paid = pay(ability.cost, facts.domains, pool)
        if (!paid) return reject('cannot-pay', 'you cannot pay that cost')
        pool = paid
      }

      const withCost: GameState = {
        ...state,
        objects: ability.exhaust
          ? { ...state.objects, [action.source]: { ...source, exhausted: true } }
          : state.objects,
        players: {
          ...state.players,
          [action.player]: { ...state.players[action.player], runePool: pool },
        },
      }

      const queued = addToChain(withCost, {
        source: action.source,
        controller: action.player,
        abilityId: action.abilityId,
      })
      const drained = advanceChain({ ...queued, priority: null }, oracle)
      const after =
        drained.state.chain.length === 0 && drained.state.pendingChoice === null
          ? advanceFlow(drained.state)
          : { state: drained.state, events: [] as readonly GameEvent[] }
      return { ok: true, state: after.state, events: [...drained.events, ...after.events] }
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
export function legalActions(
  state: GameState,
  player: PlayerId,
  oracle: CardOracle,
): readonly GameAction[] {
  if (state.winner !== null) return []

  if (state.pendingChoice) {
    return state.pendingChoice.player === player
      ? [{ type: 'resolve-choice', player, chosen: [] }]
      : []
  }

  const actions: GameAction[] = [{ type: 'concede', player }]
  if (state.priority !== player) return actions
  actions.push({ type: 'pass', player })

  // Cards in hand that are both legally timed and affordable.
  for (const card of state.players[player].hand) {
    const object = state.objects[card]
    if (!object) continue
    const facts = oracle.facts(object.cardId)
    if (!facts) continue
    if (timingRefusal(state, player, facts.keywords)) continue
    const cost = facts.cost ?? { energy: 0, power: [] }
    if (!canPay(cost, facts.domains, state.players[player].runePool, { cardType: facts.type })) {
      continue
    }
    actions.push({ type: 'play-card', player, card })
  }

  // Activated abilities of permanents this player controls.
  for (const object of Object.values(state.objects)) {
    if (object.controller !== player) continue
    if (object.zone !== 'base' && object.zone !== 'battlefield') continue
    const facts = oracle.facts(object.cardId)
    if (!facts) continue
    for (const ability of facts.abilities) {
      if (ability.kind !== 'activated') continue
      if (timingRefusal(state, player, ability.keywords ?? [])) continue
      if (ability.exhaust && object.exhausted) continue
      if (ability.cost && !canPay(ability.cost, facts.domains, state.players[player].runePool)) {
        continue
      }
      actions.push({
        type: 'activate-ability',
        player,
        source: object.id,
        abilityId: ability.id,
      })
    }
  }

  return actions
}

export { VICTORY_SCORE }
