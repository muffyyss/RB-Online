/**
 * Deterministic pseudo-random number generation for the rules engine.
 *
 * Every shuffle, coin flip and random selection in a match flows through this
 * class. The engine never touches `Math.random()`: a match is stored as a seed
 * plus an ordered action log, and replaying that log has to reproduce the game
 * exactly -- on the server, on both clients, and in a test months later. An
 * unseeded random call anywhere would break replay, desync local prediction
 * from the authoritative state, and make bug reports unreproducible.
 *
 * The generator is `sfc32`: small, fast, passes PractRand, and its whole state
 * is four 32-bit integers, so it serialises into `GameState` cleanly.
 */

/** Serialisable generator state. Four 32-bit unsigned integers. */
export type RngState = readonly [number, number, number, number]

const UINT32 = 0x1_0000_0000

/**
 * Expand a single integer seed into four well-mixed 32-bit words.
 *
 * Seeding all four words from the raw seed would leave low-entropy states
 * (seed 0, 1, 2...) visibly correlated for the first few outputs. `splitmix32`
 * avalanches each word first.
 */
function splitmix32(seed: number): RngState {
  let z = seed >>> 0
  const next = (): number => {
    z = (z + 0x9e37_79b9) >>> 0
    let t = z
    t = Math.imul(t ^ (t >>> 16), 0x21f0_aaad)
    t = Math.imul(t ^ (t >>> 15), 0x735a_2d97)
    return (t ^ (t >>> 15)) >>> 0
  }
  return [next(), next(), next(), next()]
}

export class SeededRng {
  #a: number
  #b: number
  #c: number
  #d: number

  private constructor(state: RngState) {
    this.#a = state[0] >>> 0
    this.#b = state[1] >>> 0
    this.#c = state[2] >>> 0
    this.#d = state[3] >>> 0
  }

  /** Create a generator from an integer seed. */
  static fromSeed(seed: number): SeededRng {
    const rng = new SeededRng(splitmix32(seed))
    // Discard the first few outputs so nearby seeds diverge immediately.
    for (let i = 0; i < 12; i += 1) rng.nextUint32()
    return rng
  }

  /** Restore a generator previously captured with {@link state}. */
  static fromState(state: RngState): SeededRng {
    return new SeededRng(state)
  }

  /** Snapshot the generator so it can be stored in `GameState` and restored. */
  get state(): RngState {
    return [this.#a, this.#b, this.#c, this.#d]
  }

  /** An independent copy, so speculative work cannot disturb the real stream. */
  clone(): SeededRng {
    return new SeededRng(this.state)
  }

  /** Next raw 32-bit unsigned integer. */
  nextUint32(): number {
    const t = (this.#a + this.#b) >>> 0
    this.#a = this.#b ^ (this.#b >>> 9)
    this.#b = (this.#c + (this.#c << 3)) >>> 0
    this.#c = ((this.#c << 21) | (this.#c >>> 11)) >>> 0
    this.#c = (this.#c + t) >>> 0
    this.#d = (this.#d + 0x9e37_79b9) >>> 0
    return (t + this.#d) >>> 0
  }

  /** Uniform float in [0, 1). */
  nextFloat(): number {
    return this.nextUint32() / UINT32
  }

  /**
   * Uniform integer in [0, maxExclusive).
   *
   * Uses rejection sampling rather than a modulo, which would bias low values
   * whenever `maxExclusive` does not divide 2^32 evenly. Card games notice:
   * a biased shuffle is a cheating shuffle.
   */
  nextInt(maxExclusive: number): number {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
      throw new RangeError(`maxExclusive must be a positive integer, got ${maxExclusive}`)
    }
    const limit = UINT32 - (UINT32 % maxExclusive)
    let value = this.nextUint32()
    while (value >= limit) value = this.nextUint32()
    return value % maxExclusive
  }

  /** Uniform integer in [min, max], both inclusive. */
  nextIntBetween(min: number, max: number): number {
    if (max < min) throw new RangeError(`max (${max}) must be >= min (${min})`)
    return min + this.nextInt(max - min + 1)
  }

  /** A fresh copy of `items` in random order (Fisher-Yates). Input untouched. */
  shuffle<T>(items: readonly T[]): T[] {
    const out = [...items]
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = this.nextInt(i + 1)
      const a = out[i] as T
      const b = out[j] as T
      out[i] = b
      out[j] = a
    }
    return out
  }

  /** A uniformly chosen element, or `undefined` when `items` is empty. */
  pick<T>(items: readonly T[]): T | undefined {
    if (items.length === 0) return undefined
    return items[this.nextInt(items.length)]
  }
}
