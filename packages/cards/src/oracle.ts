/**
 * Card definitions, as the engine sees them.
 *
 * The engine cannot import this package (this package imports the engine), so
 * it asks for a `CardOracle` and whoever builds a game supplies one. This is
 * that one, for the real cards: the deck builder validates against it, and the
 * server will build matches from it.
 */

import type { CardFacts, CardOracle, EngineAbility } from '@rb/engine'

import { ALL_CARDS } from './registry.js'
import type { Ability, CardDefinition } from './schema.js'
import { cardFullName } from './schema.js'

function engineAbility(ability: Ability): EngineAbility {
  const base = {
    id: ability.id,
    kind: ability.kind,
    // A passive has no steps: it is applied by the layer system, not executed.
    steps: ability.kind === 'passive' ? [] : ability.steps,
    ...(ability.notImplemented === undefined ? {} : { notImplemented: ability.notImplemented }),
  }
  if (ability.kind === 'triggered') return { ...base, on: ability.on }
  if (ability.kind === 'activated') {
    return {
      ...base,
      ...(ability.cost === undefined ? {} : { cost: ability.cost }),
      ...(ability.exhaust === undefined ? {} : { exhaust: ability.exhaust }),
      ...(ability.recycleSelf === undefined ? {} : { recycleSelf: ability.recycleSelf }),
      ...(ability.keywords === undefined ? {} : { keywords: ability.keywords }),
    }
  }
  return base
}

/** The slice of a definition the rules need. */
export function factsOf(card: CardDefinition): CardFacts {
  return {
    type: card.type,
    // Full name, because copy limits count by it (103.2.b.2).
    name: cardFullName(card),
    domains: card.domains,
    tags: card.tags ?? [],
    ...(card.supertypes === undefined ? {} : { supertypes: card.supertypes }),
    ...(card.cost === undefined ? {} : { cost: card.cost }),
    ...(card.might === undefined ? {} : { might: card.might }),
    keywords: card.keywords ?? [],
    abilities: (card.abilities ?? []).map(engineAbility),
  }
}

/** An oracle over the given cards — every authored card by default. */
export function cardOracle(cards: readonly CardDefinition[] = ALL_CARDS): CardOracle {
  const facts = new Map(cards.map((card) => [card.id, factsOf(card)]))
  return {
    facts(cardId) {
      return facts.get(cardId)
    },
  }
}
