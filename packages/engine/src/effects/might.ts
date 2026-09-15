/**
 * A unit's current Might.
 *
 * One place, because combat, damage, selectors and the client all ask, and
 * every copy that forgets a modifier is a unit that dies (or survives) wrongly.
 */

import type { CardOracle } from './oracle.js'
import type { GameObject } from '../state/game-state.js'

/**
 * Printed Might plus everything that modifies it: buff counters (+1 each, 703)
 * and Might given this turn.
 *
 * May be negative. Callers that reference it for damage treat negative as 0
 * (143.2.b), but increases and decreases work from the actual value (143.2.b.1).
 */
export function currentMight(object: GameObject, printed: number): number {
  return printed + object.buffs + (object.mightThisTurn ?? 0)
}

/** Current Might of an object, or undefined for something that has no Might. */
export function mightOf(object: GameObject, oracle: CardOracle): number | undefined {
  const printed = oracle.facts(object.cardId)?.might
  return printed === undefined ? undefined : currentMight(object, printed)
}

/** 143.2.a - nonzero damage equalling or exceeding Might kills the unit. */
export function hasLethalDamage(object: GameObject, oracle: CardOracle): boolean {
  const might = mightOf(object, oracle)
  return might !== undefined && object.damage > 0 && object.damage >= Math.max(0, might)
}
