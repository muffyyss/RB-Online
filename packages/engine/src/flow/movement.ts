/**
 * Movement and the Standard Move (144, 445-453).
 *
 * Moving is deliberately unlike playing a card: it is instantaneous, does not
 * use the Chain, and **cannot be reacted to** (446.3.c). There is no state
 * between origin and destination — a unit is either at one or the other
 * (446.3.a). So a move applies straight to the state rather than becoming a
 * Chain item.
 *
 * Every Unit has the Standard Move as an inherent ability (144), costing only
 * the exhaustion of the unit (144.2).
 */

import type { GameEvent } from '../effects/events.js'
import type { CardOracle } from '../effects/oracle.js'
import type { GameObject, GameState, Location, ObjectId, PlayerId } from '../state/game-state.js'
import { isClosedState, isShowdownState } from '../state/game-state.js'

export type MoveRefusal =
  | 'not-your-main'
  | 'chain-open'
  | 'showdown-in-progress'
  | 'not-a-unit'
  | 'not-yours'
  | 'exhausted'
  | 'not-on-board'
  | 'illegal-destination'
  | 'no-units'

function sameLocation(a: Location | undefined, b: Location): boolean {
  if (!a || a.kind !== b.kind) return false
  return a.kind === 'base' ? a.player === (b as typeof a).player : a.id === (b as typeof a).id
}

/**
 * Is this a legal Standard Move destination for the unit? (144.4)
 *
 * Base to a Battlefield, or a Battlefield back to your own Base. Battlefield to
 * Battlefield needs Ganking (144.4.c.1), which is not implemented yet — so it is
 * refused rather than quietly allowed.
 */
function legalDestination(unit: GameObject, to: Location, keywords: readonly string[]): boolean {
  const from = unit.location
  if (!from) return false

  if (from.kind === 'base' && to.kind === 'battlefield') return true
  // A unit may only return to its own controller's Base.
  if (from.kind === 'battlefield' && to.kind === 'base') return to.player === unit.controller
  if (from.kind === 'battlefield' && to.kind === 'battlefield') return keywords.includes('ganking')
  return false
}

/**
 * Why this Standard Move is illegal, or `null` if it is fine.
 *
 * 144.1 restricts the timing hard: a player's own Main Phase only, never during
 * a Closed State, and never during a Showdown or Combat.
 */
export function moveRefusal(
  state: GameState,
  player: PlayerId,
  units: readonly ObjectId[],
  to: Location,
  oracle: CardOracle,
): MoveRefusal | null {
  if (units.length === 0) return 'no-units'
  if (state.turnPlayer !== player || state.phase !== 'main') return 'not-your-main'
  if (isClosedState(state)) return 'chain-open' // 144.1.b
  if (isShowdownState(state)) return 'showdown-in-progress' // 144.1.c

  for (const id of units) {
    const unit = state.objects[id]
    if (!unit) return 'not-on-board'
    if (unit.controller !== player) return 'not-yours'
    if (unit.zone !== 'base' && unit.zone !== 'battlefield') return 'not-on-board'
    if (!unit.location) return 'not-on-board'
    // 144.2 - exhausting the unit is the cost, so an exhausted one cannot pay it.
    if (unit.exhausted) return 'exhausted'

    const facts = oracle.facts(unit.cardId)
    if (!facts || facts.type !== 'unit') return 'not-a-unit'
    if (sameLocation(unit.location, to)) return 'illegal-destination'
    if (!legalDestination(unit, to, facts.keywords)) return 'illegal-destination'
  }
  return null
}

/**
 * Perform a Standard Move.
 *
 * Several units may move together as **one** game action, provided they share a
 * destination (144.3, 144.3.a). Their origins may differ (144.3.b) and their
 * exhaust costs are paid simultaneously (144.3.c).
 *
 * The caller is responsible for running a Cleanup afterwards (453), which is
 * where Contested status and Control are worked out.
 */
export function performMove(
  state: GameState,
  units: readonly ObjectId[],
  to: Location,
  events: GameEvent[],
): GameState {
  const objects = { ...state.objects }
  for (const id of units) {
    const unit = objects[id]
    if (!unit) continue
    objects[id] = {
      ...unit,
      location: to,
      zone: to.kind === 'battlefield' ? 'battlefield' : 'base',
      exhausted: true, // 144.2
    }
    events.push({ type: 'exhausted', target: id })
    events.push({ type: 'moved', unit: id, to })
  }
  return { ...state, objects }
}
