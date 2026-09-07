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
} from '@rb/engine'
import { z } from 'zod'

/** Sets currently authored. V1 is Origins: Proving Grounds. */
export const SET_CODES = ['ogs'] as const

export type SetCode = (typeof SET_CODES)[number]

/** Card id, e.g. `OGS-014`. Stable — decks and replays reference it. */
export const cardIdSchema = z.string().regex(/^[A-Z]{3}-\d{3}$/, 'card id looks like `OGS-014`')

const powerSymbolSchema = z.union([
  z.object({ kind: z.literal('domain'), domain: z.enum(DOMAINS) }),
  z.object({ kind: z.literal('any') }), // [A] - 135.2.e.5
  z.object({ kind: z.literal('self') }), // [C] - 135.2.e.6
])

/** A printed cost: the Energy numeral plus the Power column (131.2, 131.3). */
export const costSchema = z.object({
  energy: z.number().int().nonnegative(),
  power: z.array(powerSymbolSchema),
})

const stepsSchema = z.array(effectStepSchema).min(1, 'an ability needs at least one step')

/**
 * When a triggered ability fires (382).
 *
 * Deliberately a short list. Each entry needs interpreter support and a test, so
 * it grows as the OGS set demands rather than being guessed at up front.
 */
export const TRIGGERS = [
  'enters-play',
  'leaves-play',
  'killed',
  'start-of-turn',
  'end-of-turn',
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
    steps: stepsSchema,
    notImplemented,
  }),
])

export type Ability = z.infer<typeof abilitySchema>

export const cardDefinitionSchema = z
  .object({
    id: cardIdSchema,
    set: z.enum(SET_CODES),

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

    keywords: z.array(z.enum(KEYWORDS)).optional(),
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

    // 131.1 - only Main Deck cards have a printed cost. Runes are channeled and
    // battlefields/legends start on the board (133.5.a.1, 133.6).
    const mainDeck = card.type === 'unit' || card.type === 'gear' || card.type === 'spell'
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
    for (const keyword of card.keywords ?? []) {
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
