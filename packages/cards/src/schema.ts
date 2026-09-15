/**
 * The card definition schema.
 *
 * One file per card under `src/sets/<set>/`. A definition is pure data: no
 * functions, no imports beyond this schema, nothing that cannot be serialised
 * and sent to a client. Tuning a card is editing a number here.
 *
 * Validation is grounded in the rulebook rather than in taste — a champion
 * supertype only makes sense on a unit (133.7.a), only Main Deck cards carry a
 * play cost (131.1), and so on. Getting these wrong should fail at load, not
 * halfway through a match.
 */

import {
  CARD_TYPES,
  DOMAINS,
  KEYWORDS,
  SUPERTYPES,
  effectStepSchema,
  isImplemented,
  isPermanentType,
  passiveEffectSchema,
  takesValue,
  triggerConditionSchema,
} from '@rb/engine'
import type { Keyword } from '@rb/engine'
import { z } from 'zod'

/**
 * Sets currently authored: Origins: Proving Grounds, and the Origins cards its
 * decks use. `tok` holds token definitions, which are not cards (185) and never
 * appear in a deck or the collection.
 */
export const SET_CODES = ['ogs', 'ogn', 'tok'] as const

export type SetCode = (typeof SET_CODES)[number]

/** Card id, e.g. `OGS-014`. Stable — decks and replays reference it. */
export const cardIdSchema = z.string().regex(/^[A-Z]{3}-\d{3}$/, 'card id looks like `OGS-014`')

const powerSymbolSchema = z.union([
  z.object({ kind: z.literal('domain'), domain: z.enum(DOMAINS) }),
  z.object({ kind: z.literal('any') }), // [A] - 135.2.e.5
  z.object({ kind: z.literal('self') }), // [C] - 135.2.e.6
])

/**
 * A keyword as printed: `'tank'` for [Tank], `['assault', 2]` for [Assault 2].
 *
 * A valued keyword printed without a number is written plain and has the
 * value 1 (807.1.b.3, 814.1.b.3). Only valued keywords may carry a number.
 */
export const keywordEntrySchema = z.union([
  z.enum(KEYWORDS),
  z.tuple([z.enum(KEYWORDS), z.number().int().positive()]),
])

export type KeywordEntry = z.infer<typeof keywordEntrySchema>

/** The keyword an entry names, with or without its value. */
export function keywordName(entry: KeywordEntry): Keyword {
  return typeof entry === 'string' ? entry : entry[0]
}

/** A printed cost: the Energy numeral plus the Power column (131.2, 131.3). */
export const costSchema = z.object({
  energy: z.number().int().nonnegative(),
  power: z.array(powerSymbolSchema),
})

/**
 * An ability's steps. May be empty only when the ability is marked
 * `notImplemented` (checked on the card): writing *some* of the steps for text
 * the DSL cannot express would record a wrong version of the card as if it
 * were a start.
 */
const stepsSchema = z.array(effectStepSchema)

/**
 * When a triggered ability fires (382).
 *
 * Deliberately a short list. Each entry needs interpreter support and a test, so
 * it grows as the OGS set demands rather than being guessed at up front. Dispatch lives in
 * the engine, in flow/triggers.ts.
 */
export const TRIGGERS = [
  /**
   * "When you play me" (419). Not the same as entering the board: a unit put
   * onto the board by another effect was not Played and must not fire this.
   */
  'played',
  /** "When you play a spell" — any spell its controller plays (419). */
  'spell-played',
  'enters-play',
  'leaves-play',
  'killed',
  'start-of-turn',
  'end-of-turn',
  'attack', // "When I attack"
  'defend', // "When you defend here"
  /** "When I move" - any move, not only a Standard Move. */
  'moves',
  'conquer', // 471.2.a
  'hold', // 471.2.b
  'deals-damage',
  'takes-damage',
] as const

export type Trigger = (typeof TRIGGERS)[number]

/**
 * Marks an ability whose printed text the DSL cannot yet express in full.
 *
 * A card that silently does the wrong thing is far worse than one that refuses
 * to load, so an ability carrying this is reported by card-lint and refused by
 * the engine rather than half-executed. The string says what is missing.
 */
const notImplemented = z.string().min(1).optional()

/**
 * The rulebook's ability taxonomy (360-393).
 *
 * `delayed` (389) and `reflexive` (386) exist in the rules but have no
 * interpreter support yet, so they are absent here rather than accepted and
 * ignored.
 */
export const abilitySchema = z.discriminatedUnion('kind', [
  /** Always on while the card is where it needs to be (363). */
  z.object({
    kind: z.literal('passive'),
    id: z.string().min(1),
    text: z.string().min(1),
    /** What it does, for a passive the engine understands. */
    effect: passiveEffectSchema.optional(),
    notImplemented,
  }),
  /**
   * A spell's effect, executed when the spell resolves (135.2.b.3).
   *
   * Not a triggered or activated ability - a spell does what it says as it
   * resolves and then goes to the trash (133.4.b.1).
   */
  z.object({
    kind: z.literal('spell'),
    id: z.string().min(1),
    steps: stepsSchema,
    notImplemented,
  }),
  /** Activated by its controller, paying a cost (376). */
  z.object({
    kind: z.literal('activated'),
    id: z.string().min(1),
    /** Resource cost, if any, on top of the non-resource costs below. */
    cost: costSchema.optional(),
    /** Exhaust the source as part of the cost — the [E] symbol (135.2.e.2). */
    exhaust: z.boolean().optional(),
    /** Recycle the source as part of the cost, e.g. a Rune's Power ability (164.2.b). */
    recycleSelf: z.boolean().optional(),
    keywords: z.array(z.enum(KEYWORDS)).optional(),
    steps: stepsSchema,
    notImplemented,
  }),
  /** Fires on an event (382). */
  z.object({
    kind: z.literal('triggered'),
    id: z.string().min(1),
    on: z.enum(TRIGGERS),
    /** Anything else the Condition requires, e.g. "a spell that costs 5 or more". */
    condition: triggerConditionSchema.optional(),
    steps: stepsSchema,
    notImplemented,
  }),
])

export type Ability = z.infer<typeof abilitySchema>

export const cardDefinitionSchema = z
  .object({
    id: cardIdSchema,
    set: z.enum(SET_CODES),
    /** A token's definition rather than a card (185). Lives in the `tok` set. */
    token: z.literal(true).optional(),

    /** Short name. Full name is "[Short Name], [Subtitle]" (132.4). */
    name: z.string().min(1),
    subtitle: z.string().min(1).optional(),

    type: z.enum(CARD_TYPES),
    /** Listed before the type; affects deckbuilding (133.7). */
    supertypes: z.array(z.enum(SUPERTYPES)).optional(),
    /** Listed after the type; no innate rules meaning (133.8). */
    tags: z.array(z.string().min(1)).optional(),

    domains: z.array(z.enum(DOMAINS)),
    cost: costSchema.optional(),

    /** Combat statistic, units only (143.2). */
    might: z.number().int().optional(),
    /** Modifies the Might of the card this is attached to (137). May be +0. */
    mightBonus: z.number().int().optional(),

    keywords: z.array(keywordEntrySchema).optional(),
    abilities: z.array(abilitySchema).optional(),

    /** Printed rules text, kept verbatim so a card can be checked against the real one. */
    text: z.string().optional(),
    flavor: z.string().optional(),
  })
  .strict()
  // --- rule-grounded consistency checks ---
  .superRefine((card, ctx) => {
    const fail = (message: string, path: string) =>
      ctx.addIssue({ code: 'custom', message, path: [path] })

    // 133.7.a - champion is a supertype that applies exclusively to units.
    if (card.supertypes?.includes('champion') && card.type !== 'unit') {
      fail('the champion supertype applies only to units (133.7.a)', 'supertypes')
    }

    // 185 - tokens are not cards: no cost (185.3.a), no domains (185.3.b), and
    // they belong to the token set and nowhere else.
    if (card.token !== (card.set === 'tok' ? true : undefined)) {
      fail('a token lives in the `tok` set, and everything there is a token', 'token')
    }
    if (card.token && card.domains.length > 0) fail('a token has no domains (185.3.b)', 'domains')
    if (card.token && card.cost) fail('a token has no cost (185.3.a)', 'cost')

    // 131.1 - only Main Deck cards have a printed cost. Runes are channeled and
    // battlefields/legends start on the board (133.5.a.1, 133.6).
    const mainDeck =
      !card.token && (card.type === 'unit' || card.type === 'gear' || card.type === 'spell')
    if (card.cost && !mainDeck) {
      fail(`a ${card.type} has no printed cost (131.1)`, 'cost')
    }
    if (!card.cost && mainDeck) {
      fail(`a ${card.type} must have a printed cost (131.1)`, 'cost')
    }

    // 143.2 - Might is a Unit property.
    if (card.might !== undefined && card.type !== 'unit') {
      fail('only units have Might (143.2)', 'might')
    }
    if (card.might === undefined && card.type === 'unit') {
      fail('a unit must have Might (143.2)', 'might')
    }

    // 137.3 - a Might Bonus modulates the card it is attached to, so it only
    // makes sense on something attachable.
    if (card.mightBonus !== undefined && !isPermanentType(card.type)) {
      fail('a Might Bonus belongs on an attachable permanent (137.3)', 'mightBonus')
    }

    // A keyword the engine does not implement would silently do nothing.
    const names = (card.keywords ?? []).map(keywordName)
    for (const entry of card.keywords ?? []) {
      const keyword = keywordName(entry)
      if (typeof entry !== 'string' && !takesValue(keyword)) {
        fail(`keyword "${keyword}" takes no value`, 'keywords')
      }
      if (names.indexOf(keyword) !== names.lastIndexOf(keyword)) {
        fail(`keyword "${keyword}" is listed twice; write its total value once`, 'keywords')
      }
      if (!isImplemented(keyword)) {
        fail(
          `keyword "${keyword}" is not implemented yet — add it to IMPLEMENTED_KEYWORDS with a test first`,
          'keywords',
        )
      }
    }

    // 133.4.b.1 - a spell resolves and leaves; only a spell has a resolution effect.
    const spellEffects = (card.abilities ?? []).filter((a) => a.kind === 'spell')
    if (card.type === 'spell' && spellEffects.length !== 1) {
      fail('a spell needs exactly one `spell` ability - its resolution effect', 'abilities')
    }
    if (card.type !== 'spell' && spellEffects.length > 0) {
      fail('only a spell may have a `spell` ability (133.4.b.1)', 'abilities')
    }

    // An ability with no steps does nothing, which is only acceptable when it
    // says so: otherwise it is a card that silently fails to work.
    for (const ability of card.abilities ?? []) {
      if ('steps' in ability && ability.steps.length === 0 && !ability.notImplemented) {
        fail(
          `ability "${ability.id}" has no steps; write them, or mark it notImplemented`,
          'abilities',
        )
      }
    }

    // A passive with no effect the engine understands would do nothing.
    for (const ability of card.abilities ?? []) {
      if (ability.kind === 'passive' && !ability.effect && !ability.notImplemented) {
        fail(
          `passive "${ability.id}" has no effect; give it one, or mark it notImplemented`,
          'abilities',
        )
      }
    }

    // Ability ids must be unique within a card so tests and logs can name them.
    const ids = (card.abilities ?? []).map((ability) => ability.id)
    const duplicate = ids.find((id, index) => ids.indexOf(id) !== index)
    if (duplicate) {
      fail(`duplicate ability id "${duplicate}"`, 'abilities')
    }
  })

export type CardDefinition = z.infer<typeof cardDefinitionSchema>

/**
 * Define a card. Validates eagerly, so a malformed card fails when its module is
 * loaded rather than mid-match.
 */
export function defineCard(card: CardDefinition): CardDefinition {
  return cardDefinitionSchema.parse(card)
}

/** Full name for deckbuilding and gameplay purposes (132.4). */
export function cardFullName(card: CardDefinition): string {
  return card.subtitle ? `${card.name}, ${card.subtitle}` : card.name
}
