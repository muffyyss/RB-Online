import { describe, expect, it } from 'vitest'

import type { DamageTarget } from '../src/flow/damage.js'
import { assignDamage, lethalThreshold, sumMight } from '../src/flow/damage.js'

const unit = (id: string, might: number, damage = 0, canBeDamaged?: boolean): DamageTarget =>
  canBeDamaged === undefined ? { id, might, damage } : { id, might, damage, canBeDamaged }

const asObject = (m: ReadonlyMap<string, number>) => Object.fromEntries(m)

describe('lethal threshold (143.2.a)', () => {
  it('is the unit Might when undamaged', () => {
    expect(lethalThreshold(unit('a', 3))).toBe(3)
  })

  it('accounts for damage already marked', () => {
    expect(lethalThreshold(unit('a', 3, 2))).toBe(1)
  })

  it('is never zero — zero damage is never lethal', () => {
    expect(lethalThreshold(unit('a', 3, 3))).toBe(1)
    expect(lethalThreshold(unit('a', 0))).toBe(1)
  })

  it('treats negative Might as 0 (143.2.b)', () => {
    expect(lethalThreshold(unit('a', -2))).toBe(1)
  })
})

describe('assignment must be lethal-in-full before moving on (465.2.c.3)', () => {
  it('kills the first unit before touching the second', () => {
    const result = assignDamage(4, [unit('a', 3), unit('b', 3)])
    expect(asObject(result)).toEqual({ a: 3, b: 1 })
  })

  it('spreads across several units in order', () => {
    const result = assignDamage(7, [unit('a', 2), unit('b', 3), unit('c', 5)])
    expect(asObject(result)).toEqual({ a: 2, b: 3, c: 2 })
  })

  it('assigns nothing when there is no damage', () => {
    expect(asObject(assignDamage(0, [unit('a', 3)]))).toEqual({})
  })

  it('puts everything on one unit when that is all there is', () => {
    expect(asObject(assignDamage(2, [unit('a', 5)]))).toEqual({ a: 2 })
  })
})

describe('no more than minimum lethal while units remain (465.2.c.4)', () => {
  it('does not overkill the first unit when a second is available', () => {
    // 5 damage into two 2-Might units: 2 and 2, with 1 left over.
    const result = assignDamage(5, [unit('a', 2), unit('b', 2)])
    // The leftover has nowhere else to go, so it lands on the first.
    expect(result.get('b')).toBe(2)
    expect(result.get('a')).toBe(3)
  })

  it('only exceeds the minimum once every unit has lethal assigned', () => {
    const result = assignDamage(10, [unit('a', 2), unit('b', 3)])
    expect(result.get('b')).toBe(3)
    expect(result.get('a')).toBe(7) // 2 lethal + 5 spare
    expect([...result.values()].reduce((a, b) => a + b, 0)).toBe(10)
  })

  it('accounts for existing damage when deciding what is lethal', () => {
    // 'a' has 2 damage on 3 Might, so 1 more kills it.
    const result = assignDamage(4, [unit('a', 3, 2), unit('b', 3)])
    expect(asObject(result)).toEqual({ a: 1, b: 3 })
  })
})

describe('undamageable units are exempt (465.2.c.10)', () => {
  it('skips them entirely', () => {
    const result = assignDamage(5, [unit('shield', 2, 0, false), unit('b', 3)])
    expect(result.has('shield')).toBe(false)
    expect(result.get('b')).toBe(5) // 3 lethal + 2 spare, nowhere else to go
  })

  it('assigns nothing at all when every unit is undamageable', () => {
    const result = assignDamage(9, [unit('a', 2, 0, false), unit('b', 3, 0, false)])
    expect(asObject(result)).toEqual({})
  })
})

describe('assigning is not dealing (465.2.c.1)', () => {
  it('assigns to every unit up front, including ones that will already be dead', () => {
    // All three are assigned in one pass. Nothing is dealt yet, so a unit dying
    // cannot prevent the damage already assigned to the next one.
    const result = assignDamage(6, [unit('a', 2), unit('b', 2), unit('c', 2)])
    expect(asObject(result)).toEqual({ a: 2, b: 2, c: 2 })
  })
})

describe('summing Might (465.2.a, 143.2.b)', () => {
  it('adds up a side', () => {
    expect(sumMight([unit('a', 2), unit('b', 3)])).toBe(5)
  })

  it('counts negative Might as 0 rather than subtracting', () => {
    expect(sumMight([unit('a', 4), unit('b', -3)])).toBe(4)
  })

  it('is 0 for an empty side', () => {
    expect(sumMight([])).toBe(0)
  })
})

describe('conservation', () => {
  it('never assigns more damage than it was given', () => {
    const cases: [number, DamageTarget[]][] = [
      [7, [unit('a', 2), unit('b', 3)]],
      [1, [unit('a', 5), unit('b', 5)]],
      [12, [unit('a', 1), unit('b', 1), unit('c', 1)]],
      [4, [unit('a', 3, 1), unit('b', 2, 2)]],
    ]
    for (const [total, targets] of cases) {
      const assigned = [...assignDamage(total, targets).values()].reduce((a, b) => a + b, 0)
      expect(assigned).toBe(total)
    }
  })
})
