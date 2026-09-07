/**
 * Combat damage assignment (465.2.c).
 *
 * The rulebook is unusually precise here, and the constraints interact:
 *
 *  - **Assigning is not dealing** (465.2.c.1). Everything is assigned first,
 *    then dealt simultaneously — so a unit that dies cannot stop damage already
 *    assigned to another.
 *  - Lethal damage must be assigned **in full** to a unit before any goes to
 *    another (465.2.c.3).
 *  - A unit may **not** be assigned more than the minimum lethal amount unless
 *    no further units remain to assign to (465.2.c.4).
 *  - A unit that cannot be dealt damage has **no** lethal threshold, and is
 *    exempt from mandatory assignment entirely (465.2.c.10).
 *
 * Pure and separate from the rest of combat so it can be tested exhaustively:
 * this is the part most likely to be subtly wrong.
 */

import type { ObjectId } from '../state/game-state.js'

export interface DamageTarget {
  readonly id: ObjectId
  /** Current Might, after buffs and any modifiers. */
  readonly might: number
  /** Damage already marked on it this turn. */
  readonly damage: number
  /**
   * Whether damage can be dealt to it at all.
   *
   * A unit that cannot be dealt damage has no lethal threshold, so no amount
   * counts as lethal and it is exempt from mandatory assignment (465.2.c.10).
   */
  readonly canBeDamaged?: boolean
}

/**
 * Damage still needed to kill this unit.
 *
 * A unit dies to non-zero damage equalling or exceeding its Might (143.2.a), so
 * damage already marked counts toward the total. Might below 0 is treated as 0
 * when summing (143.2.b), which makes the threshold at least 1 — zero damage is
 * never lethal.
 */
export function lethalThreshold(target: DamageTarget): number {
  const effective = Math.max(0, target.might)
  return Math.max(1, effective - target.damage)
}

/**
 * Split `total` damage across `targets`, in the assigning player's chosen order.
 *
 * Order matters and is the assigning player's to pick (465.2.c.7); the caller
 * passes them already ordered. Returns how much each target is assigned —
 * targets that get nothing are simply absent.
 */
export function assignDamage(
  total: number,
  targets: readonly DamageTarget[],
): ReadonlyMap<ObjectId, number> {
  const assignment = new Map<ObjectId, number>()
  if (total <= 0) return assignment

  // 465.2.c.10 - undamageable units are exempt from mandatory assignment.
  const eligible = targets.filter((t) => t.canBeDamaged !== false)
  if (eligible.length === 0) return assignment

  let remaining = total

  for (const target of eligible) {
    if (remaining <= 0) break
    const lethal = lethalThreshold(target)
    if (remaining >= lethal) {
      // 465.2.c.3 - lethal in full before moving on, and 465.2.c.4 - no more
      // than the minimum, while other units still await assignment.
      assignment.set(target.id, lethal)
      remaining -= lethal
    } else {
      // Not enough left to kill it; the rest goes here and assignment ends.
      assignment.set(target.id, remaining)
      remaining = 0
    }
  }

  // Every eligible unit has lethal assigned and damage is left over. Only now,
  // with no further units to assign to, may a unit take more than its minimum
  // (465.2.c.4). It goes on the first target, which is the assigning player's
  // choice to make; first-in-order keeps it deterministic.
  if (remaining > 0) {
    const first = eligible[0]
    if (first) assignment.set(first.id, (assignment.get(first.id) ?? 0) + remaining)
  }

  return assignment
}

/** Total Might a side contributes, with negative Might counted as 0 (143.2.b). */
export function sumMight(targets: readonly DamageTarget[]): number {
  return targets.reduce((total, t) => total + Math.max(0, t.might), 0)
}
