/**
 * The effect interpreter — executing an ability's steps against the state.
 *
 * The one hard requirement: **it never blocks and never calls back into user
 * input.** When a step needs a decision, execution suspends into a serialisable
 * `Execution` and a `PendingChoice`, and nothing advances until that exact
 * player answers. Mid-resolution choices are where TCG engines usually rot,
 * because an interpreter that awaits input cannot be replayed, redacted, or run
 * on the client for prediction.
 *
 * Resumption uses a stack of frames rather than a single step index, so nested
 * `may` and `for-each` steps suspend and resume correctly at any depth.
 */

import type { Amount, EffectStep, Target } from './steps.js'
import type { CardOracle } from './oracle.js'
import type { GameEvent } from './events.js'
import { resolveSelector, selectorCount } from './selector.js'
import type { SelectorContext } from './selector.js'
import { SeededRng } from '../rng.js'
import type { GameObject, GameState, ObjectId, PlayerId, PlayerState } from '../state/game-state.js'
import { opponentOf } from '../state/game-state.js'

/** One level of nesting: a step list and how far through it we are. */
export interface Frame {
  readonly steps: readonly EffectStep[]
  readonly index: number
  /** Set on a `for-each` frame: what it iterates and where it has got to. */
  readonly loop?: {
    readonly as: string
    readonly ids: readonly ObjectId[]
    readonly position: number
  }
}

/** A suspended or in-progress ability. Serialisable, so it survives replay. */
export interface Execution {
  readonly source: ObjectId
  readonly controller: PlayerId
  readonly frames: readonly Frame[]
  readonly bindings: Readonly<Record<string, readonly ObjectId[]>>
}

export type ExecutionResult =
  | { readonly status: 'done'; readonly state: GameState; readonly events: readonly GameEvent[] }
  | {
      readonly status: 'awaiting-choice'
      readonly state: GameState
      readonly events: readonly GameEvent[]
      readonly execution: Execution
    }

// ---------------------------------------------------------------------------
// Small immutable helpers
// ---------------------------------------------------------------------------

function withObject(state: GameState, id: ObjectId, patch: Partial<GameObject>): GameState {
  const object = state.objects[id]
  if (!object) return state
  return { ...state, objects: { ...state.objects, [id]: { ...object, ...patch } } }
}

function withPlayer(state: GameState, id: PlayerId, patch: Partial<PlayerState>): GameState {
  return { ...state, players: { ...state.players, [id]: { ...state.players[id], ...patch } } }
}

/** Move an object between a player's list zones, keeping both lists correct. */
function moveTo(
  state: GameState,
  id: ObjectId,
  zone: 'hand' | 'trash' | 'banishment' | 'mainDeck' | 'runeDeck' | 'base',
  toBottom = false,
): GameState {
  const object = state.objects[id]
  if (!object) return state
  const owner = state.players[object.owner]

  const listZones = ['hand', 'trash', 'banishment', 'mainDeck', 'runeDeck', 'base'] as const
  let next = state
  for (const name of listZones) {
    const list = owner[name]
    if (list.includes(id)) {
      next = withPlayer(next, object.owner, { [name]: list.filter((x) => x !== id) })
    }
  }
  const destination = next.players[object.owner][zone]
  next = withPlayer(next, object.owner, {
    [zone]: toBottom ? [...destination, id] : [id, ...destination],
  })
  // Leaving the board clears position and combat bookkeeping. Buffs go too:
  // if a unit leaves play, remove all buffs from it (705). The cleared fields
  // are omitted rather than set to undefined, which `exactOptionalPropertyTypes`
  // forbids and which would otherwise leave a stale key on the wire.
  const current = next.objects[id]
  if (!current) return next
  const updated: GameObject =
    zone === 'base'
      ? { ...current, zone }
      : {
          id: current.id,
          cardId: current.cardId,
          owner: current.owner,
          controller: current.owner,
          zone,
          exhausted: false,
          damage: 0,
          buffs: 0,
          faceDown: false,
        }
  return { ...next, objects: { ...next.objects, [id]: updated } }
}

/** Current Might: printed plus buff counters, each worth +1 (703). */
function mightOf(state: GameState, oracle: CardOracle, id: ObjectId): number | undefined {
  const object = state.objects[id]
  if (!object) return undefined
  const printed = oracle.facts(object.cardId)?.might
  return printed === undefined ? undefined : printed + object.buffs
}

// ---------------------------------------------------------------------------
// Game actions
// ---------------------------------------------------------------------------

/**
 * Burn Out (431): recycle the trash into the Main Deck and give an opponent a
 * point. Repeated burn-outs are legal and expected (431.3.a).
 */
function burnOut(state: GameState, player: PlayerId, events: GameEvent[]): GameState {
  const p = state.players[player]
  let next = state
  for (const id of p.trash) {
    next = withObject(next, id, { zone: 'mainDeck' })
  }
  next = withPlayer(next, player, { mainDeck: [...p.mainDeck, ...p.trash], trash: [] })

  const rng = SeededRng.fromState(next.rng)
  const shuffled = rng.shuffle(next.players[player].mainDeck)
  next = { ...next, rng: rng.state }
  next = withPlayer(next, player, { mainDeck: shuffled })

  // 431.2.c - choose an opponent to gain 1 point. With two players there is no
  // choice to make, so it resolves without suspending.
  const beneficiary = opponentOf(player)
  const gained = next.players[beneficiary].points + 1
  next = withPlayer(next, beneficiary, { points: gained })
  events.push({ type: 'burned-out', player, gavePointTo: beneficiary })
  events.push({ type: 'points-gained', player: beneficiary, amount: 1 })
  return next
}

function draw(state: GameState, player: PlayerId, count: number, events: GameEvent[]): GameState {
  let next = state
  const drawn: ObjectId[] = []
  for (let i = 0; i < count; i += 1) {
    const deck = next.players[player].mainDeck
    if (deck.length === 0) {
      // 431.1.a - draw as many as possible, burn out, then draw the rest.
      next = burnOut(next, player, events)
      if (next.players[player].mainDeck.length === 0) break // 431.3 - empty again
    }
    const [top, ...rest] = next.players[player].mainDeck
    if (!top) break
    next = withPlayer(next, player, { mainDeck: rest })
    next = moveTo(next, top, 'hand')
    drawn.push(top)
  }
  if (drawn.length > 0) events.push({ type: 'drew', player, cards: drawn })
  return next
}

function damage(
  state: GameState,
  oracle: CardOracle,
  target: ObjectId,
  amount: number,
  events: GameEvent[],
): GameState {
  const object = state.objects[target]
  if (!object || amount <= 0) return state
  const total = object.damage + amount
  let next = withObject(state, target, { damage: total })
  events.push({ type: 'damage-dealt', target, amount })

  // 143.2.a - nonzero damage equalling or exceeding Might kills the unit.
  const might = mightOf(next, oracle, target)
  if (might !== undefined && total > 0 && total >= might) {
    next = moveTo(next, target, 'trash')
    events.push({ type: 'killed', target })
  }
  return next
}

// ---------------------------------------------------------------------------
// Step execution
// ---------------------------------------------------------------------------

function targetIds(
  state: GameState,
  target: Target,
  bindings: Readonly<Record<string, readonly ObjectId[]>>,
  ctx: SelectorContext,
): readonly ObjectId[] {
  if (typeof target === 'string') return bindings[target] ?? []
  return resolveSelector(state, target, ctx).slice(0, selectorCount(target))
}

function amountOf(state: GameState, amount: Amount, ctx: SelectorContext): number {
  if (typeof amount === 'number') return amount
  return resolveSelector(state, amount.count, ctx).length
}

interface StepOutcome {
  readonly state: GameState
  /** Set when the step needs a decision before anything else can happen. */
  readonly choice?: {
    readonly binding: string
    readonly candidates: readonly ObjectId[]
    readonly min: number
    readonly max: number
    readonly optional: boolean
  }
  /** Frames to push, for steps that contain other steps. */
  readonly push?: Frame
}

function runStep(
  state: GameState,
  step: EffectStep,
  execution: Execution,
  oracle: CardOracle,
  events: GameEvent[],
): StepOutcome {
  const ctx: SelectorContext = {
    controller: execution.controller,
    source: execution.source,
    oracle,
  }
  const self = execution.controller
  const other = opponentOf(self)
  const bindings = execution.bindings
  const resolve = (target: Target) => targetIds(state, target, bindings, ctx)

  switch (step.op) {
    case 'choose': {
      const candidates = resolveSelector(state, step.from, ctx)
      const wanted = selectorCount(step.from)
      if (candidates.length === 0) {
        // Do as much as you can, ignoring impossible instructions (Golden/Silver
        // Rules, 054). An empty binding makes dependent steps no-ops.
        events.push({ type: 'effect-skipped', reason: 'no-targets', detail: step.as })
        return { state }
      }
      return {
        state,
        choice: {
          binding: step.as,
          candidates,
          min: step.optional ? 0 : Math.min(wanted, candidates.length),
          max: Math.min(wanted, candidates.length),
          optional: step.optional ?? false,
        },
      }
    }

    case 'deal': {
      let next = state
      const amount = amountOf(state, step.amount, ctx)
      for (const id of resolve(step.target)) next = damage(next, oracle, id, amount, events)
      return { state: next }
    }

    case 'heal': {
      let next = state
      for (const id of resolve(step.target)) {
        next = withObject(next, id, { damage: 0 })
        events.push({ type: 'healed', target: id })
      }
      return { state: next }
    }

    case 'kill': {
      let next = state
      for (const id of resolve(step.target)) {
        next = moveTo(next, id, 'trash')
        events.push({ type: 'killed', target: id })
      }
      return { state: next }
    }

    case 'banish': {
      let next = state
      for (const id of resolve(step.target)) {
        next = moveTo(next, id, 'banishment')
        events.push({ type: 'banished', target: id })
      }
      return { state: next }
    }

    case 'buff': {
      let next = state
      const amount = amountOf(state, step.amount ?? 1, ctx)
      for (const id of resolve(step.target)) {
        const object = next.objects[id]
        if (!object) continue
        next = withObject(next, id, { buffs: object.buffs + amount })
        events.push({ type: 'buffed', target: id, amount })
      }
      return { state: next }
    }

    case 'exhaust': {
      let next = state
      for (const id of resolve(step.target)) {
        next = withObject(next, id, { exhausted: true })
        events.push({ type: 'exhausted', target: id })
      }
      return { state: next }
    }

    case 'ready': {
      let next = state
      for (const id of resolve(step.target)) {
        next = withObject(next, id, { exhausted: false })
        events.push({ type: 'readied', target: id })
      }
      return { state: next }
    }

    case 'stun': {
      let next = state
      for (const id of resolve(step.target)) {
        // Stun's full behaviour (423) is not modelled yet; exhausting is the
        // visible part. Flagged so it is not mistaken for complete.
        next = withObject(next, id, { exhausted: true })
        events.push({ type: 'stunned', target: id })
      }
      return { state: next }
    }

    case 'draw': {
      const who = step.who === 'opponent' ? other : self
      return { state: draw(state, who, amountOf(state, step.amount ?? 1, ctx), events) }
    }

    case 'add': {
      const pool = state.players[self].runePool
      const power = { ...pool.power }
      for (const domain of step.power ?? []) power[domain] = (power[domain] ?? 0) + 1
      const next = withPlayer(state, self, {
        runePool: {
          energy: pool.energy + (step.energy ?? 0),
          power,
          universal: pool.universal + (step.universal ?? 0),
        },
      })
      events.push({
        type: 'resources-added',
        player: self,
        energy: step.energy ?? 0,
        power: step.power ?? [],
        universal: step.universal ?? 0,
      })
      return { state: next }
    }

    case 'discard':
    case 'recycle':
    case 'channel': {
      // These need zone plumbing that lands with the flow machine; refusing is
      // better than silently doing nothing.
      events.push({ type: 'effect-skipped', reason: 'not-implemented', detail: step.op })
      return { state }
    }

    case 'may': {
      // Without a decision point of its own, `may` currently runs its steps.
      // The opt-in prompt arrives with the choice system's boolean prompts.
      return { state, push: { steps: step.steps, index: 0 } }
    }

    case 'for-each': {
      const ids = resolveSelector(state, step.of, ctx)
      if (ids.length === 0) return { state }
      return {
        state,
        push: { steps: step.steps, index: 0, loop: { as: step.as, ids, position: 0 } },
      }
    }
  }
}

// ---------------------------------------------------------------------------
// The driver
// ---------------------------------------------------------------------------

function advance(frames: readonly Frame[]): readonly Frame[] {
  const next = [...frames]
  const top = next[next.length - 1]
  if (!top) return next
  next[next.length - 1] = { ...top, index: top.index + 1 }
  return next
}

/** Pop finished frames, stepping a `for-each` to its next iteration first. */
function unwind(
  frames: readonly Frame[],
  bindings: Record<string, readonly ObjectId[]>,
): readonly Frame[] {
  let next = [...frames]
  while (next.length > 0) {
    const top = next[next.length - 1]
    if (!top) break
    if (top.index < top.steps.length) break

    if (top.loop) {
      const position = top.loop.position + 1
      if (position < top.loop.ids.length) {
        const id = top.loop.ids[position]
        if (id !== undefined) bindings[top.loop.as] = [id]
        next[next.length - 1] = { ...top, index: 0, loop: { ...top.loop, position } }
        continue
      }
      delete bindings[top.loop.as]
    }
    next.pop()
    if (next.length > 0) next = [...advance(next)]
  }
  return next
}

/**
 * Run an execution until it finishes or needs a decision.
 *
 * Called both to start an ability and to resume one after a choice is answered.
 */
export function runExecution(
  state: GameState,
  execution: Execution,
  oracle: CardOracle,
): ExecutionResult {
  const events: GameEvent[] = []
  const bindings: Record<string, readonly ObjectId[]> = { ...execution.bindings }
  let frames = [...execution.frames]
  let current = state

  // A for-each frame binds its first element before its body runs.
  for (const frame of frames) {
    if (frame.loop && frame.index === 0) {
      const id = frame.loop.ids[frame.loop.position]
      if (id !== undefined) bindings[frame.loop.as] = [id]
    }
  }

  // Bounded rather than `while (true)`: a malformed card must fail loudly
  // instead of hanging a match thread.
  for (let guard = 0; guard < 10_000; guard += 1) {
    frames = [...unwind(frames, bindings)]
    if (frames.length === 0) {
      return { status: 'done', state: current, events }
    }

    const top = frames[frames.length - 1]
    if (!top) break
    const step = top.steps[top.index]
    if (!step) continue

    const outcome = runStep(current, step, { ...execution, bindings, frames }, oracle, events)
    current = outcome.state

    if (outcome.choice) {
      const suspended: Execution = {
        ...execution,
        bindings,
        // Resume *after* the choose step; the answer fills its binding.
        frames: [...advance(frames)],
      }
      events.push({
        type: 'choice-required',
        player: execution.controller,
        binding: outcome.choice.binding,
      })
      return {
        status: 'awaiting-choice',
        state: {
          ...current,
          pendingChoice: { player: execution.controller, ...outcome.choice },
        },
        events,
        execution: suspended,
      }
    }

    if (outcome.push) {
      // A for-each binds its first element before its body runs. `unwind` binds
      // subsequent iterations, but the first one happens here, at push time.
      const loop = outcome.push.loop
      if (loop) {
        const first = loop.ids[loop.position]
        if (first !== undefined) bindings[loop.as] = [first]
      }
      frames = [...frames, outcome.push]
    } else {
      frames = [...advance(frames)]
    }
  }

  throw new Error(`effect from ${execution.source} did not terminate`)
}

/** Begin executing an ability's steps. */
export function beginExecution(
  state: GameState,
  params: { source: ObjectId; controller: PlayerId; steps: readonly EffectStep[] },
  oracle: CardOracle,
): ExecutionResult {
  return runExecution(
    state,
    {
      source: params.source,
      controller: params.controller,
      frames: [{ steps: params.steps, index: 0 }],
      bindings: {},
    },
    oracle,
  )
}

/** Answer a pending choice and continue where the ability left off. */
export function resolveChoice(
  state: GameState,
  execution: Execution,
  binding: string,
  chosen: readonly ObjectId[],
  oracle: CardOracle,
): ExecutionResult {
  const resumed: Execution = {
    ...execution,
    bindings: { ...execution.bindings, [binding]: chosen },
  }
  return runExecution({ ...state, pendingChoice: null }, resumed, oracle)
}
