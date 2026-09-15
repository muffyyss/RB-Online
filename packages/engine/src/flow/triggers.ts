/**
 * Triggered abilities (382-385): noticing that a Condition was met, and putting
 * the ability on the Chain.
 *
 * The engine already reports what happened as `GameEvent`s. After anything that
 * can meet a Condition — a card played, a step's task, a Cleanup — the caller
 * passes those events here, and every ability whose Condition they satisfy goes
 * on the Chain as a Pending item (383.3). From there it is an ordinary Chain
 * item: it finalizes, both players get Priority, and it resolves newest-first.
 *
 * Where an ability can trigger from (384, 385): a permanent's abilities are
 * active on the board, and a Legend's in its Legend Zone. Nothing triggers from
 * a hand, deck or trash yet; no authored card asks for that.
 *
 * Ordering (383.3.d): simultaneous triggers go on the Chain Turn Player first.
 * Within one player the rules let them choose; the engine uses the order the
 * events happened in, then object id, so a game replays identically.
 */

import type { GameEvent } from '../effects/events.js'
import type { CardOracle, EngineAbility } from '../effects/oracle.js'
import type { TriggerCondition } from '../effects/steps.js'
import type { GameObject, GameState, ObjectId, PlayerId } from '../state/game-state.js'
import { opponentOf } from '../state/game-state.js'
import { addToChain } from './chain.js'

export interface TriggerHit {
  readonly source: ObjectId
  readonly controller: PlayerId
  readonly abilityId: string
}

/** Objects whose triggered abilities are active right now (384, 385). */
function activeObjects(state: GameState, oracle: CardOracle): readonly GameObject[] {
  return Object.values(state.objects)
    .filter((object) => {
      if (object.zone === 'base' || object.zone === 'battlefield') return true
      return object.zone === 'legendZone' && oracle.facts(object.cardId)?.type === 'legend'
    })
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
}

function triggeredOn(object: GameObject, oracle: CardOracle, on: string): readonly EngineAbility[] {
  return (oracle.facts(object.cardId)?.abilities ?? []).filter(
    // An ability the engine cannot run is not put on the Chain at all: a
    // Priority window for something that then does nothing is worse than none.
    (ability) => ability.kind === 'triggered' && ability.on === on && !ability.notImplemented,
  )
}

function isUnit(object: GameObject, oracle: CardOracle): boolean {
  return oracle.facts(object.cardId)?.type === 'unit'
}

function atBattlefield(object: GameObject, battlefield: ObjectId): boolean {
  return object.location?.kind === 'battlefield' && object.location.id === battlefield
}

function conditionHolds(
  condition: TriggerCondition | undefined,
  state: GameState,
  oracle: CardOracle,
  event: GameEvent,
  controller: PlayerId,
): boolean {
  if (!condition) return true
  switch (condition.kind) {
    case 'spell-cost-at-least': {
      if (event.type !== 'spell-played') return false
      const card = state.objects[event.card]
      const energy = card ? oracle.facts(card.cardId)?.cost?.energy : undefined
      return energy !== undefined && energy >= condition.energy
    }
    case 'units-at-battlefield-at-least': {
      if (event.type !== 'scored') return false
      const units = Object.values(state.objects).filter(
        (object) =>
          object.controller === controller &&
          object.zone === 'battlefield' &&
          atBattlefield(object, event.battlefield) &&
          isUnit(object, oracle),
      )
      return units.length >= condition.count
    }
  }
}

/** Event types that can meet a Condition. Anything else is skipped outright. */
const TRIGGERING = new Set<GameEvent['type']>([
  'played',
  'spell-played',
  'turn-began',
  'turn-ending',
  'scored',
  'combat-began',
  'moved',
])

/** Every trigger one event causes, in object order. */
function hitsFor(
  state: GameState,
  oracle: CardOracle,
  event: GameEvent,
  objects: readonly GameObject[],
): TriggerHit[] {
  const hits: TriggerHit[] = []
  const add = (object: GameObject, on: string, owner: PlayerId = object.controller) => {
    for (const ability of triggeredOn(object, oracle, on)) {
      if (conditionHolds(ability.condition, state, oracle, event, owner)) {
        hits.push({ source: object.id, controller: owner, abilityId: ability.id })
      }
    }
  }
  switch (event.type) {
    // "When you play me" - the permanent itself, once it is on the board (383.4.a).
    case 'played': {
      const played = state.objects[event.card]
      if (played && (played.zone === 'base' || played.zone === 'battlefield')) {
        add(played, 'played', event.player)
      }
      return hits
    }

    // "When you play a spell" - anything its controller controls.
    case 'spell-played':
      for (const object of objects)
        if (object.controller === event.player) add(object, 'spell-played')
      return hits

    // "At the start / end of your turn."
    case 'turn-began':
      for (const object of objects)
        if (object.controller === event.player) add(object, 'start-of-turn')
      return hits
    case 'turn-ending':
      for (const object of objects)
        if (object.controller === event.player) add(object, 'end-of-turn')
      return hits

    // Conquer and Hold effects (383.4.c, 383.4.d): a unit that was there ("when
    // I conquer"), or anything else that refers to the player ("when you conquer").
    case 'scored': {
      const on = event.method === 'conquer' ? 'conquer' : 'hold'
      for (const object of objects) {
        if (object.controller !== event.player) continue
        if (isUnit(object, oracle) && !atBattlefield(object, event.battlefield)) continue
        add(object, on)
      }
      return hits
    }

    // Attack and Defend triggers (383.4.e, 383.4.f): units that took the
    // designation when the combat began.
    case 'combat-began':
      for (const object of objects) {
        if (!isUnit(object, oracle) || !atBattlefield(object, event.battlefield)) continue
        if (object.controller === event.attacker) add(object, 'attack')
        if (object.controller === event.defender) add(object, 'defend')
      }
      return hits

    // "When I move."
    case 'moved': {
      const unit = state.objects[event.unit]
      if (unit) add(unit, 'moves')
      return hits
    }

    default:
      return hits
  }
}

/** Every trigger a batch of events causes, Turn Player's first (383.3.d.1). */
export function findTriggers(
  state: GameState,
  events: readonly GameEvent[],
  oracle: CardOracle,
): readonly TriggerHit[] {
  const relevant = events.filter((event) => TRIGGERING.has(event.type))
  if (relevant.length === 0) return []
  const objects = activeObjects(state, oracle)
  const all = relevant.flatMap((event) => hitsFor(state, oracle, event, objects))
  const first = state.turnPlayer
  return [
    ...all.filter((hit) => hit.controller === first),
    ...all.filter((hit) => hit.controller === opponentOf(first)),
  ]
}

/** Put every triggered ability the events call for on the Chain as Pending items. */
export function enqueueTriggers(
  state: GameState,
  events: readonly GameEvent[],
  oracle: CardOracle,
): GameState {
  let next = state
  for (const hit of findTriggers(state, events, oracle)) next = addToChain(next, hit)
  return next
}
