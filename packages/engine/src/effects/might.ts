/**
 * A unit's current Might.
 *
 * One place, because combat, damage, selectors and the client all ask, and
 * every copy that forgets a modifier is a unit that dies (or survives) wrongly.
 */

import { keywordValue } from './oracle.js'
import type { CardFacts, CardOracle } from './oracle.js'
import type { GameObject } from '../state/game-state.js'

/**
 * Printed Might plus everything that modifies it: buff counters (+1 each, 703),
 * Might given this turn, and Assault or Shield while the unit is an attacker
 * or a defender (807.1.c, 814.1.c).
 *
 * May be negative. Callers that reference it for damage treat negative as 0
 * (143.2.b), but increases and decreases work from the actual value (143.2.b.1).
 * Undefined for something that has no Might.
 */
export function currentMight(object: GameObject, facts: CardFacts | undefined): number | undefined {
  if (facts?.might === undefined) return undefined
  const combat =
    object.combatRole === 'attacker'
      ? keywordValue(facts, 'assault')
      : object.combatRole === 'defender'
        ? keywordValue(facts, 'shield')
        : 0
  return facts.might + object.buffs + (object.mightThisTurn ?? 0) + combat
}

/** Current Might of an object, looked up through the oracle. */
export function mightOf(object: GameObject, oracle: CardOracle): number | undefined {
  return currentMight(object, oracle.facts(object.cardId))
}

/** 143.2.a - nonzero damage equalling or exceeding Might kills the unit. */
export function hasLethalDamage(object: GameObject, oracle: CardOracle): boolean {
  const might = mightOf(object, oracle)
  return might !== undefined && object.damage > 0 && object.damage >= Math.max(0, might)
}
