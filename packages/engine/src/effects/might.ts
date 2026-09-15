/**
 * A unit's current Might, and the passives that change what cards do.
 *
 * One place, because combat, damage, selectors and the client all ask, and
 * every copy that forgets a modifier is a unit that dies (or survives) wrongly.
 */

import { keywordValue } from './oracle.js'
import type { CardOracle, EngineAbility } from './oracle.js'
import { matchesSelector, resolveSelector } from './selector.js'
import type { Board, SelectorContext } from './selector.js'
import type { PassiveCondition, PassiveEffect } from './steps.js'
import type { GameObject, PlayerId } from '../state/game-state.js'

/** Where a passive works: on the board, or a Legend in its Legend Zone. */
function isActive(object: GameObject): boolean {
  return object.zone === 'base' || object.zone === 'battlefield' || object.zone === 'legendZone'
}

interface ActivePassive<K extends PassiveEffect['kind']> {
  readonly source: GameObject
  readonly effect: Extract<PassiveEffect, { kind: K }>
}

/** Every working passive of one kind, on anything in play. */
export function activePassives<K extends PassiveEffect['kind']>(
  board: Board,
  oracle: CardOracle,
  kind: K,
): readonly ActivePassive<K>[] {
  const found: ActivePassive<K>[] = []
  for (const source of Object.values(board.objects)) {
    if (!isActive(source)) continue
    const abilities: readonly EngineAbility[] = oracle.facts(source.cardId)?.abilities ?? []
    for (const ability of abilities) {
      if (ability.kind !== 'passive' || ability.notImplemented) continue
      if (ability.effect?.kind !== kind) continue
      found.push({ source, effect: ability.effect as Extract<PassiveEffect, { kind: K }> })
    }
  }
  return found
}

/** Selectors in a passive read from its source's side of the table. */
function contextOf(source: GameObject, oracle: CardOracle): SelectorContext {
  return { controller: source.controller, source: source.id, oracle }
}

function holds(
  board: Board,
  condition: PassiveCondition,
  source: GameObject,
  unit: GameObject,
  oracle: CardOracle,
): boolean {
  switch (condition.kind) {
    case 'count': {
      const count = resolveSelector(board, condition.of, contextOf(source, oracle)).length
      if (condition.atLeast !== undefined && count < condition.atLeast) return false
      if (condition.atMost !== undefined && count > condition.atMost) return false
      return true
    }
    case 'alone-in-combat': {
      const role = unit.combatRole
      if (role === undefined || (condition.role !== undefined && role !== condition.role)) {
        return false
      }
      return !Object.values(board.objects).some(
        (other) =>
          other.id !== unit.id && other.controller === unit.controller && other.combatRole === role,
      )
    }
  }
}

/** Might from passives on the board: auras, "while ..." bonuses (477.3). */
function passiveMight(board: Board, unit: GameObject, oracle: CardOracle): number {
  if (unit.zone !== 'base' && unit.zone !== 'battlefield') return 0
  let total = 0
  for (const { source, effect } of activePassives(board, oracle, 'might')) {
    const affected =
      effect.to === 'me'
        ? source.id === unit.id
        : matchesSelector(board, unit, effect.to, contextOf(source, oracle))
    if (!affected) continue
    if ((effect.while ?? []).every((condition) => holds(board, condition, source, unit, oracle))) {
      total += effect.amount
    }
  }
  return total
}

/**
 * Printed Might plus everything that modifies it: buff counters (+1 each, 703),
 * Might given this turn, Assault or Shield while the unit is an attacker or a
 * defender (807.1.c, 814.1.c), and passives in play.
 *
 * May be negative. Callers that reference it for damage treat negative as 0
 * (143.2.b), but increases and decreases work from the actual value (143.2.b.1).
 * Undefined for something that has no Might.
 */
export function mightOf(board: Board, object: GameObject, oracle: CardOracle): number | undefined {
  const facts = oracle.facts(object.cardId)
  if (facts?.might === undefined) return undefined
  const combat =
    object.combatRole === 'attacker'
      ? keywordValue(facts, 'assault')
      : object.combatRole === 'defender'
        ? keywordValue(facts, 'shield')
        : 0
  return (
    facts.might +
    object.buffs +
    (object.mightThisTurn ?? 0) +
    combat +
    passiveMight(board, object, oracle)
  )
}

/** 143.2.a - nonzero damage equalling or exceeding Might kills the unit. */
export function hasLethalDamage(board: Board, object: GameObject, oracle: CardOracle): boolean {
  const might = mightOf(board, object, oracle)
  return might !== undefined && object.damage > 0 && object.damage >= Math.max(0, might)
}

/**
 * Bonus Damage on one Deal from a spell or ability (712-714): every instance
 * that applies, summed and never negative (714.2).
 */
export function bonusDamage(
  board: Board,
  dealer: PlayerId,
  target: GameObject,
  oracle: CardOracle,
): number {
  let total = 0
  for (const { source, effect } of activePassives(board, oracle, 'bonus-damage')) {
    if (effect.dealtBy === 'self' && source.controller !== dealer) continue
    if (effect.to && !matchesSelector(board, target, effect.to, contextOf(source, oracle))) continue
    total += effect.amount
  }
  return Math.max(0, total)
}
