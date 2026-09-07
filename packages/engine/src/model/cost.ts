/**
 * Costs and the Rune Pool (131, 163-168).
 *
 * A printed cost has two independent parts (131.2, 131.3): an Energy numeral and
 * a column of Power symbols. **Energy and Power are separate currencies** —
 * Energy pays Energy costs, Power pays Power costs (163.1, 163.2). Unlike most
 * card games there is no "colourless mana pays anything" rule, so a cost is
 * satisfiable only if *both* halves are covered.
 *
 * Power symbols (135.2.e):
 *   [R] [G] [B] [O] [P] [Y]  Power of that specific Domain (135.2.e.4)
 *   [A]                      Power of any Domain (135.2.e.5)
 *   [C]                      Power of the card's own Domain (135.2.e.6)
 */

import type { CardType } from './card.js'
import type { Domain } from './domain.js'
import { DOMAINS } from './domain.js'

/**
 * One Power symbol in a printed cost.
 *
 * `self` is [C], which has no fixed meaning until resolved against the card that
 * bears it (135.2.e.6.a) — on a card with no Domain it becomes [A] (135.2.e.6.b),
 * and on a multi-Domain card it accepts any of that card's Domains (135.2.e.6.c).
 */
export type PowerSymbol =
  | { readonly kind: 'domain'; readonly domain: Domain }
  | { readonly kind: 'any' }
  | { readonly kind: 'self' }

/** A printed cost: the Energy numeral plus the Power column (131). */
export interface Cost {
  readonly energy: number
  readonly power: readonly PowerSymbol[]
}

/** A quantity of resources, however they may be spent. */
export interface Resources {
  readonly energy: number
  readonly power: Readonly<Partial<Record<Domain, number>>>
  readonly universal: number
}

/**
 * Resources that may only pay for certain kinds of card.
 *
 * The rulebook has no general concept of restricted resources — this exists
 * because cards say so, and card text supersedes rules text (Golden Rule, 001).
 * Lux, Crownguard reads "Add [2]. Use only to play spells."
 */
export interface RestrictedResources extends Resources {
  readonly onlyFor: readonly CardType[]
}

/**
 * A player's available resources (166).
 *
 * `universal` is [A] Power already in the pool, spendable on a Power cost of any
 * Domain (135.2.e.5.b). It is tracked separately rather than as a Domain because
 * it is not one.
 *
 * Restricted resources are kept in their own buckets rather than mixed into the
 * main total, because whether they can pay a cost depends on what is being paid
 * for. The common case — no restrictions at all — stays a flat count.
 */
export interface RunePool extends Resources {
  readonly restricted: readonly RestrictedResources[]
}

export const EMPTY_POOL: RunePool = { energy: 0, power: {}, universal: 0, restricted: [] }

/** What a payment is for, so restricted resources know whether they apply. */
export interface PaymentTarget {
  readonly cardType: CardType
}

/** Add two resource quantities together. */
function merge(a: Resources, b: Resources): Resources {
  const power: Partial<Record<Domain, number>> = { ...a.power }
  for (const domain of DOMAINS) {
    const extra = b.power[domain] ?? 0
    if (extra > 0) power[domain] = (power[domain] ?? 0) + extra
  }
  return {
    energy: a.energy + b.energy,
    power,
    universal: a.universal + b.universal,
  }
}

/**
 * The resources actually usable for this payment.
 *
 * Unrestricted resources always count. A restricted bucket counts only when the
 * thing being paid for is one of the types it names — and not at all when the
 * payment has no target, such as an ability cost.
 */
export function usableFor(pool: RunePool, target?: PaymentTarget): Resources {
  let usable: Resources = { energy: pool.energy, power: pool.power, universal: pool.universal }
  if (!target) return usable
  for (const bucket of pool.restricted) {
    if (bucket.onlyFor.includes(target.cardType)) usable = merge(usable, bucket)
  }
  return usable
}

/**
 * Rune Pools empty at the start of each player's Main Phase and at the end of
 * each player's turn; anything unspent is lost (167, 167.1).
 */
export function emptyPool(): RunePool {
  return EMPTY_POOL
}

/**
 * Resolve a cost's [C] symbols against the Domains of the card bearing it,
 * turning a printed cost into a concrete set of requirements (135.2.e.6).
 *
 * Each requirement becomes the set of Domains that may pay it. `null` means any
 * Domain is acceptable.
 */
export function resolveRequirements(
  cost: Cost,
  cardDomains: readonly Domain[],
): readonly (ReadonlySet<Domain> | null)[] {
  return cost.power.map((symbol) => {
    switch (symbol.kind) {
      case 'domain':
        return new Set([symbol.domain])
      case 'any':
        return null
      case 'self':
        // [C] on a card with no Domain is processed as [A] (135.2.e.6.b).
        return cardDomains.length === 0 ? null : new Set(cardDomains)
    }
  })
}

function totalPower(pool: Resources): number {
  let total = pool.universal
  for (const domain of DOMAINS) total += pool.power[domain] ?? 0
  return total
}

/**
 * Can these Power requirements be met from the pool?
 *
 * This is a bipartite matching problem: each requirement accepts some subset of
 * the available Power. A naive greedy pass gets it wrong — spending a Fury Power
 * on an [A] requirement can strand a later [R] requirement that only Fury could
 * have paid. We sort most-constrained-first and backtrack, which is exact.
 * Costs are tiny (a handful of symbols over six Domains), so the search is cheap.
 */
function canPayPower(
  requirements: readonly (ReadonlySet<Domain> | null)[],
  pool: Resources,
): boolean {
  if (requirements.length === 0) return true
  if (requirements.length > totalPower(pool)) return false

  const available: Partial<Record<Domain, number>> = { ...pool.power }
  let universal = pool.universal

  // Most constrained first: fewer acceptable Domains means fewer ways to pay.
  const ordered = [...requirements].sort(
    (a, b) => (a?.size ?? DOMAINS.length + 1) - (b?.size ?? DOMAINS.length + 1),
  )

  const solve = (index: number): boolean => {
    if (index === ordered.length) return true
    const requirement = ordered[index]
    const candidates = requirement ? [...requirement] : DOMAINS

    for (const domain of candidates) {
      const held = available[domain] ?? 0
      if (held > 0) {
        available[domain] = held - 1
        if (solve(index + 1)) return true
        available[domain] = held
      }
    }
    // Universal Power pays any Domain's cost (135.2.e.5.b). Try it last so
    // specific Power is consumed first and stays out of the way of [A].
    if (universal > 0) {
      universal -= 1
      if (solve(index + 1)) return true
      universal += 1
    }
    return false
  }

  return solve(0)
}

/**
 * Can the pool cover this cost in full?
 *
 * Both halves must be satisfiable at once. Partial payment is never legal: if a
 * player cannot pay, playing the card is undone (444.2.a).
 */
export function canPay(
  cost: Cost,
  cardDomains: readonly Domain[],
  pool: RunePool,
  target?: PaymentTarget,
): boolean {
  const usable = usableFor(pool, target)
  if (usable.energy < cost.energy) return false
  return canPayPower(resolveRequirements(cost, cardDomains), usable)
}

/** Total resource count a cost demands — handy for sorting and display. */
export function costValue(cost: Cost): number {
  return cost.energy + cost.power.length
}

/** Render a cost the way card text does, e.g. `[3][R][A]`. */
export function formatCost(cost: Cost, shorthand: Record<Domain, string>): string {
  const energy = cost.energy > 0 ? `[${String(cost.energy)}]` : ''
  const power = cost.power
    .map((symbol) => {
      switch (symbol.kind) {
        case 'domain':
          return `[${shorthand[symbol.domain]}]`
        case 'any':
          return '[A]'
        case 'self':
          return '[C]'
      }
    })
    .join('')
  return energy + power || '[0]'
}
