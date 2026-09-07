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
import type { Domain } from '../model/domain.js'
import type { Keyword } from '../model/keyword.js'
import type { CardId } from '../state/game-state.js'

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
