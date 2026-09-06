import { describe, expect, it } from 'vitest'

import { SeededRng } from '../src/rng.js'

const DECK = Array.from({ length: 40 }, (_, i) => `card-${i}`)

describe('SeededRng', () => {
  it('produces the same sequence for the same seed', () => {
    const a = SeededRng.fromSeed(12345)
    const b = SeededRng.fromSeed(12345)
    const left = Array.from({ length: 200 }, () => a.nextUint32())
    const right = Array.from({ length: 200 }, () => b.nextUint32())
    expect(left).toEqual(right)
  })

  it('diverges immediately for adjacent seeds', () => {
    // Weak seeding would leave seed 1 and 2 correlated for the first outputs,
    // which would make consecutive matches feel repetitive.
    const a = Array.from({ length: 8 }, (_, i) => SeededRng.fromSeed(i).nextUint32())
    expect(new Set(a).size).toBe(a.length)
  })

  it('round-trips through its serialisable state', () => {
    const rng = SeededRng.fromSeed(99)
    for (let i = 0; i < 10; i += 1) rng.nextUint32()

    const resumed = SeededRng.fromState(rng.state)
    const expected = Array.from({ length: 50 }, () => rng.nextUint32())
    const actual = Array.from({ length: 50 }, () => resumed.nextUint32())
    expect(actual).toEqual(expected)
  })

  it('clones without disturbing the original stream', () => {
    const rng = SeededRng.fromSeed(7)
    const clone = rng.clone()
    // Burn the clone hard; the original must be unaffected.
    for (let i = 0; i < 1000; i += 1) clone.nextUint32()
    expect(rng.nextUint32()).toBe(SeededRng.fromSeed(7).nextUint32())
  })

  it('shuffles deterministically and preserves the multiset', () => {
    const a = SeededRng.fromSeed(2024).shuffle(DECK)
    const b = SeededRng.fromSeed(2024).shuffle(DECK)
    expect(a).toEqual(b)
    expect([...a].sort()).toEqual([...DECK].sort())
    expect(a).not.toEqual(DECK) // 40 cards landing in original order is ~1/40!
  })

  it('does not mutate the array it shuffles', () => {
    const original = [...DECK]
    SeededRng.fromSeed(1).shuffle(DECK)
    expect(DECK).toEqual(original)
  })

  it('keeps nextInt inside range and unbiased enough for a card game', () => {
    const rng = SeededRng.fromSeed(555)
    const buckets = new Array<number>(6).fill(0)
    const rolls = 60_000
    let outOfRange = 0
    for (let i = 0; i < rolls; i += 1) {
      const value = rng.nextInt(6)
      if (value < 0 || value >= 6) outOfRange += 1
      buckets[value] = (buckets[value] ?? 0) + 1
    }
    expect(outOfRange).toBe(0)
    // Each face should land near 1/6; allow a generous 10% band so the test is
    // not flaky, while still catching a modulo-biased implementation.
    for (const count of buckets) {
      expect(count).toBeGreaterThan((rolls / 6) * 0.9)
      expect(count).toBeLessThan((rolls / 6) * 1.1)
    }
  })

  it('rejects invalid bounds', () => {
    const rng = SeededRng.fromSeed(1)
    expect(() => rng.nextInt(0)).toThrow(RangeError)
    expect(() => rng.nextInt(-3)).toThrow(RangeError)
    expect(() => rng.nextInt(2.5)).toThrow(RangeError)
    expect(() => rng.nextIntBetween(5, 4)).toThrow(RangeError)
  })

  it('picks from a list and returns undefined when empty', () => {
    const rng = SeededRng.fromSeed(3)
    expect(DECK).toContain(rng.pick(DECK))
    expect(rng.pick([])).toBeUndefined()
  })

  it('keeps nextFloat in [0, 1)', () => {
    const rng = SeededRng.fromSeed(42)
    for (let i = 0; i < 5000; i += 1) {
      const value = rng.nextFloat()
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })
})
