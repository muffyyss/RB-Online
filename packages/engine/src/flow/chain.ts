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
import { selectorCount } from '../effects/selector.js'
import { hasPassive } from '../effects/oracle.js'
import type { CardOracle, EngineAbility } from '../effects/oracle.js'
import type { GameEvent } from '../effects/events.js'
import type {
  ChainItem,
  Execution,
  GameState,
  Location,
  ObjectId,
  PlayerId,
} from '../state/game-state.js'
import { opponentOf } from '../state/game-state.js'
import { deflectCost, payDeflect, targetCandidates, targetChoices } from './targeting.js'
import { enqueueTriggers } from './triggers.js'

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
  item: { source: ObjectId; controller: PlayerId; abilityId?: string; to?: Location },
): GameState {
  const chainItem: ChainItem = {
    id: `chain-${String(state.nextObjectId)}`,
    controller: item.controller,
    source: item.source,
    ...(item.abilityId === undefined ? {} : { abilityId: item.abilityId }),
    ...(item.to === undefined ? {} : { to: item.to }),
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

function isSpell(state: GameState, oracle: CardOracle, item: ChainItem): boolean {
  const object = state.objects[item.source]
  return object !== undefined && oracle.facts(object.cardId)?.type === 'spell'
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

  // Playing a permanent: it enters the board. Units enter exhausted (143.4),
  // unless something says they enter ready, which replaces that (805.6).
  if (!item.abilityId && facts && (facts.type === 'unit' || facts.type === 'gear')) {
    const owner = state.players[object.owner]
    const entersReady =
      hasPassive(facts, 'enters-ready') ||
      state.players[item.controller].unitsEnterReadyThisTurn === true
    const withObject: GameState = {
      ...state,
      objects: {
        ...state.objects,
        [item.source]: {
          ...object,
          // 355.2 - where the player chose when playing it; Base by default.
          zone: item.to?.kind === 'battlefield' ? 'battlefield' : 'base',
          location: item.to ?? { kind: 'base', player: item.controller },
          controller: item.controller,
          exhausted: facts.type === 'unit' && !entersReady,
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
    // 383.4.a.2 - Play Effects trigger once the permanent is on the board.
    events.push({ type: 'played', player: item.controller, card: item.source })
    return drop(withObject, item.id)
  }

  if (!ability) return drop(state, item.id)

  const started = beginExecution(
    drop(state, item.id),
    {
      source: item.source,
      controller: item.controller,
      steps: ability.steps,
      targets: item.bindings,
    },
    oracle,
  )
  events.push(...started.events)

  if (started.status === 'awaiting-choice') {
    return { ...started.state, resolving: started.execution }
  }

  return { ...finishSpell(started.state, oracle, item.source), resolving: null }
}

/**
 * A spell finishes resolving and goes to its owner's trash (133.4.b.1).
 *
 * Called whether the spell ran straight through or paused for a choice first;
 * anything else resolving (an ability, whose source stays put) is untouched.
 */
function finishSpell(state: GameState, oracle: CardOracle, source: ObjectId): GameState {
  const object = state.objects[source]
  if (object?.zone !== 'chain' || oracle.facts(object.cardId)?.type !== 'spell') return state
  const owner = state.players[object.owner]
  return {
    ...state,
    objects: { ...state.objects, [source]: { ...object, zone: 'trash' } },
    players: {
      ...state.players,
      [object.owner]: { ...owner, trash: [source, ...owner.trash] },
    },
  }
}

/**
 * Ask for the next target a Pending item still needs (355.5), if any.
 *
 * Returns the state with that choice pending, or with the item updated or
 * removed when there was nothing to ask; null once every target is chosen.
 */
function chooseTargets(
  state: GameState,
  oracle: CardOracle,
  item: ChainItem,
  events: GameEvent[],
): GameState | null {
  const ability = findAbility(state, oracle, item.source, item.abilityId)
  if (!ability || ability.notImplemented) return null
  const step = targetChoices(ability.steps).find((choice) => !(choice.as in item.bindings))
  if (!step) return null

  const pool = state.players[item.controller].runePool
  const candidates = targetCandidates(state, oracle, step, item, pool)
  const setBinding = (ids: readonly ObjectId[]): GameState => ({
    ...state,
    chain: state.chain.map((c) =>
      c.id === item.id ? { ...c, bindings: { ...c.bindings, [step.as]: ids } } : c,
    ),
  })

  if (candidates.length === 0) {
    events.push({ type: 'effect-skipped', reason: 'no-targets', detail: step.as })
    // 355.8 - a triggered ability with a target it cannot choose never makes it
    // onto the Chain; there is nothing to give a Priority window for. A card or
    // activated ability was checked before it was played, so only a choice
    // that hangs on an earlier answer gets here: it goes ahead with nothing.
    return ability.kind === 'triggered' && step.optional !== true
      ? drop(state, item.id)
      : setBinding([])
  }

  const wanted = selectorCount(step.from)
  events.push({ type: 'choice-required', player: item.controller, binding: step.as })
  return {
    ...state,
    pendingChoice: {
      player: item.controller,
      binding: step.as,
      candidates,
      min: step.optional ? 0 : Math.min(wanted, candidates.length),
      max: Math.min(wanted, candidates.length),
      optional: step.optional ?? false,
      item: item.id,
    },
  }
}

/**
 * Record a target chosen for a Pending item (355.5), paying any Deflect on it
 * (809), then carry on finalizing. Null if the Deflect cannot be paid.
 */
export function answerTargets(
  state: GameState,
  chosen: readonly ObjectId[],
  oracle: CardOracle,
): ChainResult | null {
  const choice = state.pendingChoice
  const item = state.chain.find((c) => c.id === choice?.item)
  if (!choice || !item) return null

  const deflect = chosen.reduce(
    (total, id) => total + deflectCost(state, oracle, item.controller, id),
    0,
  )
  const player = state.players[item.controller]
  const pool = payDeflect(player.runePool, deflect)
  if (!pool) return null

  const answered: GameState = {
    ...state,
    pendingChoice: null,
    players: { ...state.players, [item.controller]: { ...player, runePool: pool } },
    chain: state.chain.map((c) =>
      c.id === item.id ? { ...c, bindings: { ...c.bindings, [choice.binding]: chosen } } : c,
    ),
  }
  return advanceChain(answered, oracle)
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
      // 355.5 - its targets are chosen first, one choice at a time.
      const asking = chooseTargets(current, oracle, pending, events)
      if (asking) {
        current = asking
        continue
      }
      const mark = events.length
      const finalized: ChainItem = { ...pending, pending: false }
      current = {
        ...current,
        chain: current.chain.map((item) => (item.id === pending.id ? finalized : item)),
      }
      // A spell counts as played once it is finalized on the Chain (419).
      if (!finalized.abilityId && isSpell(current, oracle, finalized)) {
        events.push({ type: 'spell-played', player: finalized.controller, card: finalized.source })
      }
      // 337.2 - permanents and resource abilities resolve without priority.
      if (resolvesImmediately(current, oracle, finalized)) {
        current = resolveItem(current, oracle, finalized, events)
      }
      // Anything that just happened may have met a trigger's Condition (383.3).
      current = enqueueTriggers(current, events.slice(mark), oracle)
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
      const mark = events.length
      current = { ...current, consecutivePasses: 0 }
      current = resolveItem(current, oracle, newest, events)
      current = enqueueTriggers(current, events.slice(mark), oracle)
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

  const finished = finishSpell(resumed.state, oracle, execution.source)
  const continued = advanceChain({ ...finished, resolving: null }, oracle)
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
