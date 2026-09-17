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

import { SELF_BINDING } from './steps.js'
import type { Amount, EffectStep, StepCondition, Target } from './steps.js'
import type { CardOracle } from './oracle.js'
import type { GameEvent } from './events.js'
import { replaceDeath } from './death.js'
import { bonusDamage, hasLethalDamage, mightOf, moveBlocked } from './might.js'
import { resolveSelector, selectorCount } from './selector.js'
import type { SelectorContext } from './selector.js'
import type { Domain } from '../model/domain.js'
import { SeededRng } from '../rng.js'
import type {
  Execution,
  Frame,
  GameObject,
  GameState,
  Location,
  ObjectId,
  PlayerId,
  PlayerState,
} from '../state/game-state.js'
import { ceaseIfToken, opponentOf } from '../state/game-state.js'

export type { Execution, Frame } from '../state/game-state.js'

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
          // Kept for one moment, so ceaseIfToken can tell it was a token.
          ...(current.token ? { token: true as const } : {}),
        }
  return ceaseIfToken({ ...next, objects: { ...next.objects, [id]: updated } }, id)
}

/** The one object a binding holds, if it is still on the board. */
function boundOnBoard(
  state: GameState,
  ids: readonly ObjectId[] | undefined,
): GameObject | undefined {
  const object = ids?.[0] === undefined ? undefined : state.objects[ids[0]]
  return object && isOnBoard(object) ? object : undefined
}

function isOnBoard(object: GameObject): boolean {
  return object.zone === 'base' || object.zone === 'battlefield'
}

function countByDomain(domains: readonly Domain[]): Partial<Record<Domain, number>> {
  const counts: Partial<Record<Domain, number>> = {}
  for (const domain of domains) counts[domain] = (counts[domain] ?? 0) + 1
  return counts
}

function addPower(
  a: Readonly<Partial<Record<Domain, number>>>,
  b: Readonly<Partial<Record<Domain, number>>>,
): Partial<Record<Domain, number>> {
  const sum: Partial<Record<Domain, number>> = { ...a }
  for (const [domain, count] of Object.entries(b) as [Domain, number][]) {
    sum[domain] = (sum[domain] ?? 0) + count
  }
  return sum
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
  const next = withObject(state, target, { damage: object.damage + amount })
  events.push({ type: 'damage-dealt', target, amount })
  return killIfLethal(next, oracle, target, events)
}

/** 143.2.a - a unit with nonzero damage equalling or exceeding its Might is killed. */
function killIfLethal(
  state: GameState,
  oracle: CardOracle,
  id: ObjectId,
  events: GameEvent[],
): GameState {
  const object = state.objects[id]
  if (!object || !hasLethalDamage(state, object, oracle)) return state
  return kill(state, id, events)
}

/** A unit dies (428), unless something replaces its death. */
function kill(state: GameState, id: ObjectId, events: GameEvent[]): GameState {
  const replaced = replaceDeath(state, id, events)
  if (replaced) return replaced
  events.push({ type: 'killed', target: id })
  return moveTo(state, id, 'trash')
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
  if (target === SELF_BINDING) {
    // "Me" is the source while it is on the board. Once it has left, it is a new
    // object (141.1.b.2), so an ability referring to it does nothing.
    const source = state.objects[ctx.source]
    return source && isOnBoard(source) ? [source.id] : []
  }
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
    readonly kind?: 'may' | 'predict' | 'cost'
  }
  /**
   * A frame to push, for steps that contain other steps. With a choice as
   * well, it waits on top of the suspended frames for the answer.
   */
  readonly push?: Frame
  /**
   * A binding to set without asking: emptied when there was nothing to choose,
   * so a step repeated in a loop cannot see an old answer, or narrowed to the
   * targets still legal.
   */
  readonly bind?: { readonly name: string; readonly ids: readonly ObjectId[] }
}

/**
 * Where a played token goes. A bound Battlefield only counts while it is one
 * its player controls, since tokens may be played only to those ("your base or
 * battlefields you control"); otherwise, and when nothing is bound, Base.
 */
function tokenDestination(
  state: GameState,
  /** `base`, `here`, or a binding. */
  to: string,
  player: PlayerId,
  source: GameObject | undefined,
  bindings: Readonly<Record<string, readonly ObjectId[]>>,
): Location {
  const base: Location = { kind: 'base', player }
  if (to === 'base') return base
  if (to === 'here') return source?.location ?? base
  const chosen = bindings[to]?.[0]
  const bf = state.battlefields.find((b) => b.id === chosen)
  return bf?.controller === player ? { kind: 'battlefield', id: bf.id } : base
}

/** Is an `if` step's condition true right now? */
function conditionHolds(
  state: GameState,
  condition: StepCondition,
  ctx: SelectorContext,
  bindings: Readonly<Record<string, readonly ObjectId[]>>,
): boolean {
  switch (condition.kind) {
    case 'count': {
      const count = resolveSelector(state, condition.of, ctx).length
      if (condition.atLeast !== undefined && count < condition.atLeast) return false
      if (condition.atMost !== undefined && count > condition.atMost) return false
      return true
    }
    case 'chosen':
      return (bindings[condition.binding] ?? []).length > 0
    case 'left-board': {
      const bound = bindings[condition.target] ?? []
      return (
        bound.length > 0 &&
        bound.every((id) => {
          const object = state.objects[id]
          return !object || !isOnBoard(object)
        })
      )
    }
  }
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
    bindings: execution.bindings,
  }
  const self = execution.controller
  const other = opponentOf(self)
  const bindings = execution.bindings
  const resolve = (target: Target) => targetIds(state, target, bindings, ctx)

  switch (step.op) {
    case 'choose': {
      // Chosen already, as a target when this went on the Chain (355.5). Only
      // the targets that are still legal are affected (359.3.e.2, 359.3.e.5):
      // one that has moved, changed zone or stopped fitting drops out.
      const targeted = execution.frames.length === 1 ? bindings[step.as] : undefined
      if (targeted !== undefined) {
        const legal = resolveSelector(state, step.from, ctx)
        const still = targeted.filter((id) => legal.includes(id))
        if (still.length < targeted.length) {
          events.push({ type: 'effect-skipped', reason: 'no-targets', detail: step.as })
        }
        return { state, bind: { name: step.as, ids: still } }
      }
      const candidates = resolveSelector(state, step.from, ctx)
      const wanted = selectorCount(step.from)
      if (candidates.length === 0) {
        // Do as much as you can, ignoring impossible instructions (Golden/Silver
        // Rules, 054). An empty binding makes dependent steps no-ops.
        events.push({ type: 'effect-skipped', reason: 'no-targets', detail: step.as })
        return { state, bind: { name: step.as, ids: [] } }
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
      for (const id of resolve(step.target)) {
        const target = next.objects[id]
        // 715.4 - no damage dealt, no Bonus Damage; 715.2 - each target separately.
        const bonus = target && amount > 0 ? bonusDamage(next, self, target, oracle) : 0
        next = damage(next, oracle, id, amount + bonus, events)
      }
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
      for (const id of resolve(step.target)) next = kill(next, id, events)
      return { state: next }
    }

    case 'grant-keyword': {
      let next = state
      const value = step.value ?? 1
      for (const id of resolve(step.target)) {
        const object = next.objects[id]
        if (!object || !isOnBoard(object)) continue
        const granted = object.keywordsThisCombat ?? {}
        next = withObject(next, id, {
          keywordsThisCombat: { ...granted, [step.keyword]: (granted[step.keyword] ?? 0) + value },
        })
      }
      return { state: next }
    }

    case 'deal-each-other': {
      const a = boundOnBoard(state, bindings[step.a])
      const b = boundOnBoard(state, bindings[step.b])
      // Both must still be there to fight: if either is gone, neither deals.
      if (!a || !b || a.id === b.id) return { state }
      const fromA = Math.max(0, mightOf(state, a, oracle) ?? 0)
      const fromB = Math.max(0, mightOf(state, b, oracle) ?? 0)
      let next = damage(state, oracle, b.id, fromA, events)
      next = damage(next, oracle, a.id, fromB, events)
      return { state: next }
    }

    case 'recall-instead-of-dying': {
      let next = state
      for (const id of resolve(step.target)) {
        const object = next.objects[id]
        if (object && isOnBoard(object)) next = withObject(next, id, { recallInsteadOfDying: true })
      }
      return { state: next }
    }

    case 'additional-cost':
      // Chosen and paid as the card was played (355.1.a); nothing to do now.
      return { state }

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

    case 'give-might': {
      let next = state
      const amount = amountOf(state, step.amount, ctx)
      for (const id of resolve(step.target)) {
        const object = next.objects[id]
        if (!object || !isOnBoard(object)) continue
        const might = mightOf(next, object, oracle)
        if (might === undefined) continue
        // 477.3.b - "to a minimum of N" is snapshotted: work out how much of the
        // decrease applies now, and that is what lasts the rest of the turn. A
        // unit already below the minimum loses nothing (and gains nothing).
        const applied =
          step.minimum !== undefined && amount < 0
            ? Math.min(0, Math.max(amount, step.minimum - might))
            : amount
        next = withObject(
          next,
          id,
          step.duration === 'this-turn'
            ? { mightThisTurn: (object.mightThisTurn ?? 0) + applied }
            : { mightWhileOnBoard: (object.mightWhileOnBoard ?? 0) + applied },
        )
        events.push({ type: 'might-given', target: id, amount: applied })
        // 143.2.a - a unit whose Might drops to its damage dies.
        next = killIfLethal(next, oracle, id, events)
      }
      return { state: next }
    }

    case 'move': {
      let next = state
      for (const id of resolve(step.target)) {
        const unit = next.objects[id]
        if (!unit || unit.location?.kind !== 'battlefield') continue
        if (oracle.facts(unit.cardId)?.type !== 'unit') continue
        // 447.2 - a Destination a passive forbids is not a Destination at all,
        // for an effect's Move as much as for a Standard Move (420.1).
        if (moveBlocked(next, unit, 'base', oracle)) continue
        const to = { kind: 'base', player: unit.controller } as const
        next = withObject(next, id, { zone: 'base', location: to })
        events.push({ type: 'moved', unit: id, to })
      }
      // 453 - the Cleanup this calls for runs once the Chain allows it (321.1).
      return { state: next }
    }

    case 'win-game': {
      // 466.4 - a card may simply say you win. Priority stops with the game.
      events.push({ type: 'game-won', player: self })
      return { state: { ...state, winner: self, priority: null, focus: null } }
    }

    case 'play-token': {
      let next = state
      const source = state.objects[execution.source]
      for (let i = 0; i < (step.count ?? 1); i += 1) {
        const location = tokenDestination(next, step.to, self, source, bindings)
        const id = `token-${String(next.nextObjectId)}`
        const player = next.players[self]
        next = {
          ...next,
          nextObjectId: next.nextObjectId + 1,
          objects: {
            ...next.objects,
            [id]: {
              id,
              cardId: step.token,
              owner: self, // 183 - whoever controlled the effect
              controller: self, // 182
              zone: location.kind === 'base' ? 'base' : 'battlefield',
              location,
              // 185.2.d - a token unit follows the rules for units: it enters
              // exhausted unless its player's units are entering ready.
              exhausted: player.unitsEnterReadyThisTurn !== true,
              damage: 0,
              buffs: 0,
              faceDown: false,
              token: true,
            },
          },
          players: { ...next.players, [self]: { ...player, base: [...player.base, id] } },
        }
        events.push({ type: 'played', player: self, card: id })
      }
      // Arriving at a Battlefield calls for a Cleanup, which runs once the
      // Chain allows it (321.1).
      return { state: next }
    }

    case 'units-enter-ready': {
      events.push({ type: 'units-enter-ready', player: self })
      return { state: withPlayer(state, self, { unitsEnterReadyThisTurn: true }) }
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
      const added = {
        energy: step.energy ?? 0,
        power: countByDomain(step.power ?? []),
        universal: step.universal ?? 0,
      }
      // Restricted resources go in their own bucket: whether they can pay a
      // cost depends on what is being paid for, so they cannot be folded into
      // the main total.
      const next = withPlayer(state, self, {
        runePool: step.onlyFor?.length
          ? { ...pool, restricted: [...pool.restricted, { ...added, onlyFor: step.onlyFor }] }
          : {
              ...pool,
              energy: pool.energy + added.energy,
              power: addPower(pool.power, added.power),
              universal: pool.universal + added.universal,
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

    case 'return-to-hand': {
      let next = state
      for (const id of resolve(step.target)) {
        const object = next.objects[id]
        if (!object || object.zone === 'hand' || object.zone === 'chain') continue
        next = moveTo(next, id, 'hand')
        events.push({ type: 'returned-to-hand', target: id })
      }
      return { state: next }
    }

    case 'discard': {
      let next = state
      const discarded: Partial<Record<PlayerId, ObjectId[]>> = {}
      for (const id of resolve(step.target)) {
        const object = next.objects[id]
        if (object?.zone !== 'hand') continue
        next = moveTo(next, id, 'trash')
        ;(discarded[object.owner] ??= []).push(id)
      }
      for (const player of [0, 1] as const) {
        const cards = discarded[player]
        if (cards) events.push({ type: 'discarded', player, cards })
      }
      return { state: next }
    }

    case 'channel': {
      const p = state.players[self]
      const taken = p.runeDeck.slice(0, amountOf(state, step.amount ?? 1, ctx))
      // 430.3 - fewer than asked for if the Rune Deck runs short.
      if (taken.length === 0) return { state }
      const objects = { ...state.objects }
      for (const id of taken) {
        const rune = objects[id]
        if (!rune) continue
        objects[id] = {
          ...rune,
          zone: 'base',
          location: { kind: 'base', player: self },
          exhausted: step.exhausted ?? false,
        }
      }
      events.push({ type: 'channeled', player: self, runes: taken })
      return {
        state: withPlayer({ ...state, objects }, self, {
          runeDeck: p.runeDeck.slice(taken.length),
          base: [...p.base, ...taken],
        }),
      }
    }

    case 'recycle': {
      let next = state
      const recycled: Partial<Record<PlayerId, ObjectId[]>> = {}
      for (const id of resolve(step.target)) {
        const object = next.objects[id]
        if (!object || object.zone === 'chain') continue
        const deck = oracle.facts(object.cardId)?.type === 'rune' ? 'runeDeck' : 'mainDeck'
        // 416.1 - the bottom of the owner's deck.
        next = moveTo(next, id, deck, true)
        ;(recycled[object.owner] ??= []).push(id)
      }
      for (const player of [0, 1] as const) {
        const cards = recycled[player]
        if (cards) events.push({ type: 'recycled', player, cards })
      }
      return { state: next }
    }

    case 'predict': {
      const top = state.players[self].mainDeck[0]
      if (top === undefined) return { state }
      const answer = `$predict-${String(execution.frames.length)}`
      return {
        state,
        choice: {
          binding: answer,
          candidates: [top],
          min: 0,
          max: 1,
          optional: true,
          kind: 'predict',
        },
        push: { steps: [{ op: 'recycle', target: answer }], index: 0, onlyIf: answer },
      }
    }

    case 'may': {
      // Ask the controller. Their answer fills a binding named for this depth,
      // so a nested `may` cannot read an outer one's answer; the steps wait in
      // a frame that runs only on yes.
      const answer = `$may-${String(execution.frames.length)}`
      return {
        state,
        choice: {
          binding: answer,
          candidates: [execution.source],
          min: 0,
          max: 1,
          optional: true,
          kind: 'may',
        },
        push: { steps: step.steps, index: 0, onlyIf: answer },
      }
    }

    case 'repeat': {
      // A loop over placeholder ids: the same machinery as for-each, binding a
      // counter nobody reads.
      const ids = Array.from({ length: step.times }, (_, i) => String(i))
      return {
        state,
        push: {
          steps: step.steps,
          index: 0,
          loop: { as: `$repeat-${String(execution.frames.length)}`, ids, position: 0 },
        },
      }
    }

    case 'if': {
      const steps = conditionHolds(state, step.condition, ctx, bindings)
        ? step.then
        : (step.else ?? [])
      return steps.length === 0 ? { state } : { state, push: { steps, index: 0 } }
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
    // A declined `may`: skip its steps entirely.
    if (top.onlyIf !== undefined && top.index === 0 && !bindings[top.onlyIf]?.length) {
      events.push({ type: 'effect-skipped', reason: 'declined', detail: top.onlyIf })
      frames[frames.length - 1] = { ...top, index: top.steps.length }
      continue
    }
    const step = top.steps[top.index]
    if (!step) continue

    const outcome = runStep(current, step, { ...execution, bindings, frames }, oracle, events)
    current = outcome.state

    if (outcome.choice) {
      const suspended: Execution = {
        ...execution,
        bindings,
        // Resume *after* the choosing step; the answer fills its binding. A
        // frame that waits on the answer goes on top instead, and its parent is
        // stepped past when that frame finishes, as for any nested frame.
        frames: outcome.push ? [...frames, outcome.push] : [...advance(frames)],
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

    if (outcome.bind) bindings[outcome.bind.name] = outcome.bind.ids

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
  params: {
    source: ObjectId
    controller: PlayerId
    steps: readonly EffectStep[]
    /** Targets chosen as it was put on the Chain (355.5), by binding name. */
    targets?: Readonly<Record<string, readonly ObjectId[]>>
  },
  oracle: CardOracle,
): ExecutionResult {
  return runExecution(
    state,
    {
      source: params.source,
      controller: params.controller,
      frames: [{ steps: params.steps, index: 0 }],
      bindings: params.targets ?? {},
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
