/**
 * The Chain, and the FEPR loop that drains it (327-340).
 *
 * FEPR is **F**inalize, **E**xecute, **P**ass, **R**esolve — the second half of
 * HOT FEPR (334). Two orderings matter and are easy to invert:
 *
 *   - Items **finalize oldest-first** (337.1.b).
 *   - Items **resolve newest-first** (340.1).
 *
 * The rule most likely to be missed is 337.2: a Unit, Gear, or an ability that
 * Adds resources resolves *immediately* on finalizing, without anyone getting
 * priority. That is what makes it impossible to respond to a unit being played,
 * and skipping it would quietly turn every permanent into a spell.
 */

import { beginExecution, runExecution } from '../effects/interpreter.js'
import type { CardOracle, EngineAbility } from '../effects/oracle.js'
import type { GameEvent } from '../effects/events.js'
import type { ChainItem, Execution, GameState, ObjectId, PlayerId } from '../state/game-state.js'
import { opponentOf } from '../state/game-state.js'

/** Players in a Duel. Passing this many times in a row resolves the top item. */
const PLAYER_COUNT = 2

export interface ChainResult {
  readonly state: GameState
  readonly events: readonly GameEvent[]
}

function findAbility(
  state: GameState,
  oracle: CardOracle,
  source: ObjectId,
  abilityId: string | undefined,
): EngineAbility | undefined {
  const object = state.objects[source]
  if (!object) return undefined
  const abilities = oracle.facts(object.cardId)?.abilities ?? []
  if (abilityId) return abilities.find((a) => a.id === abilityId)
  // A card played with no ability named: a spell resolves its `spell` ability.
  return abilities.find((a) => a.kind === 'spell')
}

/**
 * Put a card or ability on the Chain as a Pending item (329).
 *
 * Adding to the Chain resets the pass count: 339.1 asks whether all players
 * passed *in sequence without adding any items*, so any addition restarts that.
 */
export function addToChain(
  state: GameState,
  item: { source: ObjectId; controller: PlayerId; abilityId?: string },
): GameState {
  const chainItem: ChainItem = {
    id: `chain-${String(state.nextObjectId)}`,
    controller: item.controller,
    source: item.source,
    ...(item.abilityId === undefined ? {} : { abilityId: item.abilityId }),
    pending: true,
    bindings: {},
  }
  return {
    ...state,
    chain: [...state.chain, chainItem],
    nextObjectId: state.nextObjectId + 1,
    consecutivePasses: 0,
  }
}

/**
 * 337.2 — does this item resolve the moment it finalizes, without priority?
 *
 * Units and Gear (Permanents) do, and so does any ability that Adds resources —
 * which is why a Rune can always be exhausted for Energy mid-payment (444.2.c)
 * without handing the opponent a window.
 */
function resolvesImmediately(state: GameState, oracle: CardOracle, item: ChainItem): boolean {
  const object = state.objects[item.source]
  if (!object) return false
  const facts = oracle.facts(object.cardId)
  if (!facts) return false

  if (!item.abilityId && (facts.type === 'unit' || facts.type === 'gear')) return true

  const ability = findAbility(state, oracle, item.source, item.abilityId)
  if (!ability) return false
  return ability.steps.some((step) => step.op === 'add')
}

/** Remove an item from the Chain. */
function drop(state: GameState, id: ObjectId): GameState {
  return { ...state, chain: state.chain.filter((c) => c.id !== id) }
}

/**
 * Resolve one Chain item completely (340.1).
 *
 * A permanent enters the board; a spell runs its effect and goes to the trash
 * (133.4.b.1). Resolution may suspend on a choice, in which case the execution
 * is parked on the state and the loop stops until the player answers.
 */
function resolveItem(
  state: GameState,
  oracle: CardOracle,
  item: ChainItem,
  events: GameEvent[],
): GameState {
  const object = state.objects[item.source]
  if (!object) return drop(state, item.id)

  const facts = oracle.facts(object.cardId)
  const ability = findAbility(state, oracle, item.source, item.abilityId)

  // A card the DSL cannot express in full is refused rather than half-run.
  if (ability?.notImplemented) {
    events.push({
      type: 'effect-skipped',
      reason: 'not-implemented',
      detail: `${object.cardId} ${ability.id}: ${ability.notImplemented}`,
    })
    return drop(state, item.id)
  }

  // Playing a permanent: it enters the board. Units enter exhausted (143.4).
  if (!item.abilityId && facts && (facts.type === 'unit' || facts.type === 'gear')) {
    const owner = state.players[object.owner]
    const withObject: GameState = {
      ...state,
      objects: {
        ...state.objects,
        [item.source]: {
          ...object,
          zone: 'base',
          location: { kind: 'base', player: item.controller },
          controller: item.controller,
          exhausted: facts.type === 'unit',
        },
      },
      players: {
        ...state.players,
        [object.owner]: {
          ...owner,
          hand: owner.hand.filter((id) => id !== item.source),
          base: [...owner.base, item.source],
        },
      },
    }
    return drop(withObject, item.id)
  }

  if (!ability) return drop(state, item.id)

  const started = beginExecution(
    drop(state, item.id),
    { source: item.source, controller: item.controller, steps: ability.steps },
    oracle,
  )
  events.push(...started.events)

  if (started.status === 'awaiting-choice') {
    return { ...started.state, resolving: started.execution }
  }

  // A spell finishes resolving and goes to its owner's trash (133.4.b.1).
  let next = started.state
  if (facts?.type === 'spell') {
    const owner = next.players[object.owner]
    next = {
      ...next,
      objects: { ...next.objects, [item.source]: { ...object, zone: 'trash' } },
      players: {
        ...next.players,
        [object.owner]: {
          ...owner,
          hand: owner.hand.filter((id) => id !== item.source),
          trash: [item.source, ...owner.trash],
        },
      },
    }
  }
  return { ...next, resolving: null }
}

/**
 * Drive the Chain until it needs a decision or empties.
 *
 * Returns with either a player holding Priority (they may respond or pass), a
 * pending choice awaiting an answer, or an empty Chain and no Priority — in
 * which case the caller returns to the phase machine.
 */
export function advanceChain(state: GameState, oracle: CardOracle): ChainResult {
  const events: GameEvent[] = []
  let current = state

  for (let guard = 0; guard < 1000; guard += 1) {
    if (current.winner !== null || current.pendingChoice) break

    // --- Step 1: Finalize (337) - oldest Pending item first.
    const pending = current.chain.find((item) => item.pending)
    if (pending) {
      const finalized: ChainItem = { ...pending, pending: false }
      current = {
        ...current,
        chain: current.chain.map((item) => (item.id === pending.id ? finalized : item)),
      }
      // 337.2 - permanents and resource abilities resolve without priority.
      if (resolvesImmediately(current, oracle, finalized)) {
        current = resolveItem(current, oracle, finalized, events)
      }
      continue
    }

    if (current.chain.length === 0) {
      // Chain gone: back to an Open State, priority returns to the phase.
      current = { ...current, priority: null, consecutivePasses: 0 }
      break
    }

    // --- Step 3/4: everyone passed in sequence, so the newest item resolves.
    if (current.consecutivePasses >= PLAYER_COUNT) {
      const newest = current.chain[current.chain.length - 1]
      if (!newest) break
      current = { ...current, consecutivePasses: 0 }
      current = resolveItem(current, oracle, newest, events)
      continue
    }

    // --- Step 2: Execute - the controller of the newest item gets priority
    // and may respond or pass (337.4, 340.4).
    const newest = current.chain[current.chain.length - 1]
    if (!newest) break
    if (current.priority === null) {
      current = { ...current, priority: newest.controller }
    }
    break
  }

  return { state: current, events }
}

/**
 * Resume an ability that suspended on a choice, then keep draining the Chain.
 */
export function resumeResolution(
  state: GameState,
  execution: Execution,
  oracle: CardOracle,
): ChainResult {
  const resumed = runExecution({ ...state, pendingChoice: null }, execution, oracle)
  const events = [...resumed.events]

  if (resumed.status === 'awaiting-choice') {
    return { state: { ...resumed.state, resolving: resumed.execution }, events }
  }

  const continued = advanceChain({ ...resumed.state, resolving: null }, oracle)
  return { state: continued.state, events: [...events, ...continued.events] }
}

/** Pass priority within a Chain (338.1.b, 339). */
export function passOnChain(state: GameState): GameState {
  const holder = state.priority
  if (holder === null) return state
  return {
    ...state,
    consecutivePasses: state.consecutivePasses + 1,
    priority: opponentOf(holder),
  }
}
