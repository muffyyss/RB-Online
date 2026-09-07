import { describe, expect, it } from 'vitest'

import type { Cost, RunePool } from '../src/model/cost.js'
import { canPay, costValue, formatCost, resolveRequirements, usableFor } from '../src/model/cost.js'
import { DOMAIN_SHORTHAND } from '../src/model/domain.js'
import type { Domain } from '../src/model/domain.js'

const pool = (p: Partial<RunePool> & { power?: Partial<Record<Domain, number>> }): RunePool => ({
  energy: p.energy ?? 0,
  power: p.power ?? {},
  universal: p.universal ?? 0,
  restricted: p.restricted ?? [],
})

const cost = (energy: number, ...power: Cost['power']): Cost => ({ energy, power })
const dom = (domain: Domain) => ({ kind: 'domain', domain }) as const
const any = { kind: 'any' } as const
const self = { kind: 'self' } as const

describe('cost — Energy and Power are separate currencies (163.1, 163.2)', () => {
  it('pays a pure Energy cost from Energy', () => {
    expect(canPay(cost(3), [], pool({ energy: 3 }))).toBe(true)
    expect(canPay(cost(3), [], pool({ energy: 2 }))).toBe(false)
  })

  it('does NOT let Power pay an Energy cost', () => {
    // The rule most likely to be imported by habit from other card games.
    expect(canPay(cost(1), [], pool({ energy: 0, power: { fury: 5 } }))).toBe(false)
  })

  it('does NOT let Energy pay a Power cost', () => {
    expect(canPay(cost(0, dom('fury')), [], pool({ energy: 5 }))).toBe(false)
  })

  it('requires both halves at once', () => {
    const c = cost(2, dom('fury'))
    expect(canPay(c, [], pool({ energy: 2, power: { fury: 1 } }))).toBe(true)
    expect(canPay(c, [], pool({ energy: 1, power: { fury: 1 } }))).toBe(false)
    expect(canPay(c, [], pool({ energy: 2, power: {} }))).toBe(false)
  })
})

describe('cost — Power matching', () => {
  it('matches specific Domain requirements', () => {
    expect(canPay(cost(0, dom('fury')), [], pool({ power: { fury: 1 } }))).toBe(true)
    expect(canPay(cost(0, dom('fury')), [], pool({ power: { calm: 1 } }))).toBe(false)
  })

  it('spends universal [A] Power on any Domain (135.2.e.5.b)', () => {
    expect(canPay(cost(0, dom('fury')), [], pool({ universal: 1 }))).toBe(true)
    expect(canPay(cost(0, dom('fury'), dom('calm')), [], pool({ universal: 2 }))).toBe(true)
  })

  it('pays an [A] requirement with Power of any Domain (135.2.e.5.a)', () => {
    expect(canPay(cost(0, any), [], pool({ power: { chaos: 1 } }))).toBe(true)
  })

  it('does not strand a specific requirement by spending its Power on [A]', () => {
    // The bug a naive greedy pass makes: pay [A] with the only Fury Power, then
    // fail the [R]. Correct play is calm -> [A], fury -> [R].
    const c = cost(0, any, dom('fury'))
    expect(canPay(c, [], pool({ power: { fury: 1, calm: 1 } }))).toBe(true)
    // With only one Power available it genuinely cannot be paid.
    expect(canPay(c, [], pool({ power: { fury: 1 } }))).toBe(false)
  })

  it('handles a case that needs backtracking across equally-constrained requirements', () => {
    const c = cost(0, dom('fury'), dom('fury'), any)
    expect(canPay(c, [], pool({ power: { fury: 2, mind: 1 } }))).toBe(true)
    expect(canPay(c, [], pool({ power: { fury: 1, mind: 2 } }))).toBe(false)
  })

  it('counts total Power correctly when mixing specific and universal', () => {
    const c = cost(0, dom('fury'), dom('calm'), dom('mind'))
    expect(canPay(c, [], pool({ power: { fury: 1 }, universal: 2 }))).toBe(true)
    expect(canPay(c, [], pool({ power: { fury: 1 }, universal: 1 }))).toBe(false)
  })
})

describe('cost — [C] resolves against the card that bears it (135.2.e.6)', () => {
  it('accepts the card own Domain', () => {
    expect(canPay(cost(0, self), ['fury'], pool({ power: { fury: 1 } }))).toBe(true)
    expect(canPay(cost(0, self), ['fury'], pool({ power: { calm: 1 } }))).toBe(false)
  })

  it('accepts any of a multi-Domain card Domains (135.2.e.6.c)', () => {
    expect(canPay(cost(0, self), ['fury', 'calm'], pool({ power: { calm: 1 } }))).toBe(true)
    expect(canPay(cost(0, self), ['fury', 'calm'], pool({ power: { mind: 1 } }))).toBe(false)
  })

  it('becomes [A] on a card with no Domain (135.2.e.6.b)', () => {
    expect(canPay(cost(0, self), [], pool({ power: { mind: 1 } }))).toBe(true)
    const resolved = resolveRequirements(cost(0, self), [])
    expect(resolved[0]).toBeNull()
  })
})

describe('cost — formatting', () => {
  it('renders like card text', () => {
    expect(formatCost(cost(3, dom('fury')), DOMAIN_SHORTHAND)).toBe('[3][R]')
    expect(formatCost(cost(0, any, self), DOMAIN_SHORTHAND)).toBe('[A][C]')
    expect(formatCost(cost(2), DOMAIN_SHORTHAND)).toBe('[2]')
    expect(formatCost(cost(0), DOMAIN_SHORTHAND)).toBe('[0]')
  })

  it('totals a cost value', () => {
    expect(costValue(cost(3, dom('fury'), any))).toBe(5)
  })
})

describe('cost — restricted resources (Golden Rule, 001)', () => {
  // Lux, Crownguard: "Add [2]. Use only to play spells."
  const spellOnly = pool({
    restricted: [{ energy: 2, power: {}, universal: 0, onlyFor: ['spell'] }],
  })

  it('pays for a card of a permitted type', () => {
    expect(canPay(cost(2), [], spellOnly, { cardType: 'spell' })).toBe(true)
  })

  it('will not pay for a card of any other type', () => {
    expect(canPay(cost(2), [], spellOnly, { cardType: 'unit' })).toBe(false)
    expect(canPay(cost(2), [], spellOnly, { cardType: 'gear' })).toBe(false)
  })

  it('is unusable when the payment has no target, such as an ability cost', () => {
    expect(canPay(cost(2), [], spellOnly)).toBe(false)
  })

  it('tops up unrestricted resources rather than replacing them', () => {
    const mixed = pool({
      energy: 1,
      restricted: [{ energy: 2, power: {}, universal: 0, onlyFor: ['spell'] }],
    })
    expect(canPay(cost(3), [], mixed, { cardType: 'spell' })).toBe(true)
    // Only the unrestricted 1 Energy counts toward a unit.
    expect(canPay(cost(3), [], mixed, { cardType: 'unit' })).toBe(false)
    expect(canPay(cost(1), [], mixed, { cardType: 'unit' })).toBe(true)
  })

  it('combines restricted Power with unrestricted Power', () => {
    const mixed = pool({
      power: { fury: 1 },
      restricted: [{ energy: 0, power: { calm: 1 }, universal: 0, onlyFor: ['spell'] }],
    })
    const c = cost(0, dom('fury'), dom('calm'))
    expect(canPay(c, [], mixed, { cardType: 'spell' })).toBe(true)
    expect(canPay(c, [], mixed, { cardType: 'unit' })).toBe(false)
  })

  it('reports what is usable for a given target', () => {
    expect(usableFor(spellOnly, { cardType: 'spell' }).energy).toBe(2)
    expect(usableFor(spellOnly, { cardType: 'unit' }).energy).toBe(0)
    expect(usableFor(spellOnly).energy).toBe(0)
  })
})
