/**
 * Resolving selectors to concrete objects.
 *
 * A selector describes *what* a step acts on; this turns it into the list of
 * object ids that currently match. Selectors are evaluated against the real
 * state at resolution time, never captured when the ability was written — a
 * unit that arrived since the ability went on the Chain is still a candidate.
 */

import type { Selector } from './steps.js'
import type { CardOracle } from './oracle.js'
import type { GameObject, GameState, Location, ObjectId, PlayerId } from '../state/game-state.js'
import { isPermanentType } from '../model/card.js'

/** Where the ability's source sits, so `here` and `same-location` mean something. */
export interface SelectorContext {
  readonly controller: PlayerId
  readonly source: ObjectId
  readonly oracle: CardOracle
}

function sameLocation(a: Location | undefined, b: Location | undefined): boolean {
  if (!a || !b || a.kind !== b.kind) return false
  return a.kind === 'base' ? a.player === (b as typeof a).player : a.id === (b as typeof a).id
}

/**
 * Does this object match the selector's `kind`?
 *
 * `rune` is deliberately not covered by `permanent`: Runes sit on the board but
 * are not Permanents, because they are not Main Deck cards (161.1.a). Card text
 * saying "permanent" must not catch them.
 */
function matchesKind(object: GameObject, selector: Selector, oracle: CardOracle): boolean {
  const facts = oracle.facts(object.cardId)
  if (!facts) return false
  switch (selector.kind) {
    case 'unit':
      return facts.type === 'unit'
    case 'gear':
      return facts.type === 'gear'
    case 'rune':
      return facts.type === 'rune'
    case 'permanent':
      return isPermanentType(facts.type)
    case 'battlefield':
      return facts.type === 'battlefield'
    case 'card':
      return true
  }
}

function matchesLocation(
  object: GameObject,
  selector: Selector,
  ctx: SelectorContext,
  state: GameState,
): boolean {
  const at = selector.at ?? 'anywhere'
  if (at === 'anywhere') return true

  const source = state.objects[ctx.source]
  switch (at) {
    case 'here':
      // Battlefield text says "here" to mean its own Battlefield (Silver Rule, 050).
      return source?.location
        ? sameLocation(object.location, source.location)
        : object.location?.kind === 'battlefield' && object.location.id === ctx.source
    case 'same-location':
      return sameLocation(object.location, source?.location)
    case 'base':
      return object.location?.kind === 'base'
    case 'any-battlefield':
      return object.location?.kind === 'battlefield'
  }
}

function matchesController(object: GameObject, selector: Selector, ctx: SelectorContext): boolean {
  switch (selector.controller ?? 'any') {
    case 'self':
      return object.controller === ctx.controller
    case 'opponent':
      return object.controller !== ctx.controller
    case 'any':
      return true
  }
}

function matchesMight(object: GameObject, selector: Selector, oracle: CardOracle): boolean {
  if (!selector.might) return true
  const printed = oracle.facts(object.cardId)?.might
  if (printed === undefined) return false
  // Buffs each add +1 Might (703). Full layer application lands with the rest
  // of the continuous-effect system; printed plus buffs is correct for now.
  const might = printed + object.buffs
  const { min, max } = selector.might
  if (min !== undefined && might < min) return false
  if (max !== undefined && might > max) return false
  return true
}

/**
 * Every object currently matching the selector.
 *
 * Objects that are not on the board are excluded unless the selector asks for
 * cards generally: a unit in the trash keeps its type but cannot be acted on by
 * effects that target units on the board (141.1.b.2).
 */
export function resolveSelector(
  state: GameState,
  selector: Selector,
  ctx: SelectorContext,
): readonly ObjectId[] {
  const onBoard = selector.kind !== 'card'
  return Object.values(state.objects)
    .filter((object) => {
      if (onBoard && object.zone !== 'base' && object.zone !== 'battlefield') return false
      if (!matchesKind(object, selector, ctx.oracle)) return false
      if (!matchesController(object, selector, ctx)) return false
      if (!matchesLocation(object, selector, ctx, state)) return false
      if (!matchesMight(object, selector, ctx.oracle)) return false
      if (selector.tag) {
        const tags = ctx.oracle.facts(object.cardId)?.tags ?? []
        if (!tags.includes(selector.tag)) return false
      }
      return true
    })
    .map((object) => object.id)
}

/** How many objects a selector asks for. Absent means exactly one. */
export function selectorCount(selector: Selector): number {
  return selector.count ?? 1
}
