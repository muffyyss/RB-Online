/**
 * Card facts the engine needs, without depending on the card data.
 *
 * `@rb/cards` depends on `@rb/engine`, so the engine cannot import card
 * definitions — that would be a cycle. Instead the engine declares the small
 * slice of a card it actually needs to reason about, and whoever builds a game
 * supplies it. That also lets tests use a handful of made-up cards instead of
 * dragging the whole set in.
 */

import type { CardType, Supertype, Tag } from '../model/card.js'
import type { Cost } from '../model/cost.js'
import type { Domain } from '../model/domain.js'
import type { Keyword } from '../model/keyword.js'
import type { CardId } from '../state/game-state.js'
import type { EffectStep, PassiveEffect, TriggerCondition } from './steps.js'

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
  /**
   * Extra requirement written into a trigger's Condition, e.g. "a spell that
   * costs 5 or more". Part of the Condition, not the Effect (383.2.a.1): if it
   * is not met, the ability does not trigger at all.
   */
  readonly condition?: TriggerCondition
  /** What a passive does, when it is one the engine understands. */
  readonly effect?: PassiveEffect
  readonly steps: readonly EffectStep[]
  /** Resource cost of activating it, if any. */
  readonly cost?: Cost
  /** Exhausting the source is part of the cost - the [E] symbol (135.2.e.2). */
  readonly exhaust?: boolean
  /**
   * Recycling the source is part of the cost: it goes to the bottom of its
   * owner's deck before the ability resolves (416). A Basic Rune's Power ability
   * (164.2.b).
   */
  readonly recycleSelf?: boolean
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
  /**
   * Listed before the type and affecting deckbuilding (133.7).
   *
   * `champion` gates the Chosen Champion slot; `signature` is capped at three
   * per deck regardless of name (103.2.d.1).
   */
  readonly supertypes?: readonly Supertype[]
  /** Printed cost, Main Deck cards only (131.1). */
  readonly cost?: Cost
  /** Printed Might, units only (143.2). Modifiers are applied by the layer system. */
  readonly might?: number
  readonly keywords: readonly Keyword[]
  /**
   * Printed values of valued keywords, e.g. `{ assault: 2 }` for [Assault 2].
   * A keyword in `keywords` with no entry here has the value 1.
   */
  readonly keywordValues?: Readonly<Partial<Record<Keyword, number>>>
  readonly abilities: readonly EngineAbility[]
}

/** Whether a card has a working passive with this effect. */
export function hasPassive(facts: CardFacts, kind: PassiveEffect['kind']): boolean {
  return facts.abilities.some(
    (ability) =>
      ability.kind === 'passive' && ability.effect?.kind === kind && !ability.notImplemented,
  )
}

/** A keyword's value on a card: 0 without it, 1 if printed without a number. */
export function keywordValue(facts: CardFacts, keyword: Keyword): number {
  if (!facts.keywords.includes(keyword)) return 0
  return facts.keywordValues?.[keyword] ?? 1
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
