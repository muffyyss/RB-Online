/**
 * Targeting (355.6-355.16): choosing what a spell or ability acts on as it is
 * put on the Chain, not as it resolves.
 *
 * That timing is what gives the other player something to react to: they see
 * the Incinerate aimed at their unit before deciding whether to answer it. It
 * also means a spell with nothing to aim at cannot be played at all (355.8),
 * and that a target may be gone, or no longer fit, by the time the spell
 * resolves (359.3.e), in which case it is simply unaffected.
 *
 * In the effect DSL a target is a top-level `choose` from a public place: the
 * board or a trash (355.10.a). A `choose` nested inside `may`, `if`,
 * `for-each` or `repeat`, or one from a hand, is still made on resolution
 * (355.17), as the rules say for choices that are not targets.
 */

import type { CardFacts, CardOracle } from '../effects/oracle.js'
import { keywordOn } from '../effects/might.js'
import { resolveSelector } from '../effects/selector.js'
import type { EffectStep } from '../effects/steps.js'
import { canPay, pay } from '../model/cost.js'
import type { Cost, RunePool } from '../model/cost.js'
import type { GameState, ObjectId, PlayerId } from '../state/game-state.js'

export type ChooseStep = Extract<EffectStep, { op: 'choose' }>

export type AdditionalCostStep = Extract<EffectStep, { op: 'additional-cost' }>

/** Optional additional costs, chosen before targets as the card is played (355.1.a). */
export function costChoices(steps: readonly EffectStep[]): readonly AdditionalCostStep[] {
  return steps.filter((step): step is AdditionalCostStep => step.op === 'additional-cost')
}

/** Zones whose contents are not public, so choosing from them is not targeting (355.10.a). */
const PRIVATE_ZONES: ReadonlySet<string> = new Set(['hand', 'runeDeck', 'mainDeck'])

/** The steps of an ability that choose targets, in order. */
export function targetChoices(steps: readonly EffectStep[]): readonly ChooseStep[] {
  return steps.filter(
    (step): step is ChooseStep =>
      step.op === 'choose' && !PRIVATE_ZONES.has(step.from.zone ?? 'board'),
  )
}

/** Whether a target choice depends on an earlier one ("...at that battlefield"). */
function dependsOnBinding(step: ChooseStep): boolean {
  return typeof step.from.at === 'string' && step.from.at.startsWith('$')
}

/**
 * Deflect (809): what choosing this object costs, in Power of any Domain. Only
 * an opponent's spells and abilities pay it (809.1.c).
 */
export function deflectCost(
  state: GameState,
  oracle: CardOracle,
  chooser: PlayerId,
  target: ObjectId,
): number {
  const object = state.objects[target]
  if (!object || object.controller === chooser) return 0
  return keywordOn(state, object, oracle, 'deflect')
}

/** [A] Power, `count` times over. */
function anyPower(count: number): Cost {
  return { energy: 0, power: Array.from({ length: count }, () => ({ kind: 'any' as const })) }
}

/** Whether a pool covers a Deflect cost. Restricted resources are for cards, not this. */
export function canPayDeflect(pool: RunePool, amount: number): boolean {
  return amount === 0 || canPay(anyPower(amount), [], pool)
}

/** Pay a Deflect cost, or null if the pool cannot. */
export function payDeflect(pool: RunePool, amount: number): RunePool | null {
  return amount === 0 ? pool : pay(anyPower(amount), [], pool)
}

/**
 * The valid targets for a choice right now (355.9): what its selector matches,
 * less anything whose Deflect the chooser could not pay on its own.
 */
export function targetCandidates(
  state: GameState,
  oracle: CardOracle,
  step: ChooseStep,
  chooser: {
    controller: PlayerId
    source: ObjectId
    bindings: Readonly<Record<string, readonly ObjectId[]>>
  },
  pool: RunePool,
): readonly ObjectId[] {
  const matching = resolveSelector(state, step.from, { ...chooser, oracle })
  return matching.filter((id) =>
    canPayDeflect(pool, deflectCost(state, oracle, chooser.controller, id)),
  )
}

/**
 * 355.8 - whether every target this ability needs can be chosen. A choice that
 * is optional ("up to") needs nothing, and one that depends on an earlier
 * choice is taken on trust, since its candidates depend on that answer.
 */
export function hasTargets(
  state: GameState,
  oracle: CardOracle,
  steps: readonly EffectStep[],
  controller: PlayerId,
  source: ObjectId,
  pool: RunePool,
): boolean {
  return targetChoices(steps).every(
    (step) =>
      step.optional === true ||
      dependsOnBinding(step) ||
      targetCandidates(state, oracle, step, { controller, source, bindings: {} }, pool).length > 0,
  )
}

/** The steps a card runs as a spell, for checking its targets before it is played. */
export function spellSteps(facts: CardFacts): readonly EffectStep[] {
  return facts.abilities.find((ability) => ability.kind === 'spell')?.steps ?? []
}
