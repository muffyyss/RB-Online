/**
 * Card facts the engine needs, without depending on the card data.
 *
 * `@rb/cards` depends on `@rb/engine`, so the engine cannot import card
 * definitions — that would be a cycle. Instead the engine declares the small
 * slice of a card it actually needs to reason about, and whoever builds a game
 * supplies it. That also lets tests use a handful of made-up cards instead of
 * dragging the whole set in.
 */

import type { CardType, Tag } from '../model/card.js'
import type { Cost } from '../model/cost.js'
import type { Domain } from '../model/domain.js'
import type { Keyword } from '../model/keyword.js'
import type { CardId } from '../state/game-state.js'
import type { EffectStep } from './steps.js'

/**
 * An ability as the engine executes it.
 *
 * The engine declares this shape and `@rb/cards` adapts its definitions to it,
 * keeping the dependency pointing one way. It is deliberately narrower than the
 * authoring schema: the engine needs what to run and what it costs, not the
 * printed text or the flavour.
 */
export interface EngineAbility {
  readonly id: string
  /** Matches the rulebook's taxonomy (360-393). */
  readonly kind: 'passive' | 'spell' | 'activated' | 'triggered'
  /** Event that fires a triggered ability (382). */
  readonly on?: string
  readonly steps: readonly EffectStep[]
  /** Resource cost of activating it, if any. */
  readonly cost?: Cost
  /** Exhausting the source is part of the cost - the [E] symbol (135.2.e.2). */
  readonly exhaust?: boolean
  readonly keywords?: readonly Keyword[]
  /**
   * Set when the DSL cannot express the printed text in full. The engine
   * refuses to run these rather than executing a partial version.
   */
  readonly notImplemented?: string
}

/** What the engine needs to know about a card to resolve rules against it. */
export interface CardFacts {
  readonly type: CardType
  readonly name: string
  readonly domains: readonly Domain[]
  /** Tags carry no innate meaning but card text references them (133.8.a). */
  readonly tags: readonly Tag[]
  /** Printed Might, units only (143.2). Modifiers are applied by the layer system. */
  readonly might?: number
  readonly keywords: readonly Keyword[]
  readonly abilities: readonly EngineAbility[]
}

export interface CardOracle {
  facts(cardId: CardId): CardFacts | undefined
}

/** Build an oracle from a plain map. Handy in tests. */
export function oracleFrom(facts: Readonly<Record<CardId, CardFacts>>): CardOracle {
  return {
    facts(cardId) {
      return facts[cardId]
    },
  }
}
