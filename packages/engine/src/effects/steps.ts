/**
 * The effect-step vocabulary — how card abilities are expressed.
 *
 * Cards are **declarative data**, never code. An ability is an ordered list of
 * steps, each naming one of the rulebook's Game Actions (412-444) plus a few
 * control-flow atoms of our own. Three reasons this matters:
 *
 *  1. Tuning is a one-line edit. Changing a skill from 3 to 2 means editing an
 *     `amount`, with no engine change and no recompile.
 *  2. Steps are serialisable, so the client can run the same interpreter over
 *     its redacted view for instant local prediction.
 *  3. Using the rulebook's own action names keeps card definitions checkable
 *     against printed card text.
 *
 * Schemas are the source of truth; the TypeScript types are inferred from them,
 * so validation and typing cannot drift apart.
 */

import { z } from 'zod'

import { DOMAINS } from '../model/domain.js'

/**
 * Every Game Action the rulebook defines (413-444).
 *
 * Listed in full so the vocabulary is anchored to the rules rather than
 * invented. `IMPLEMENTED_OPS` below records which ones the interpreter actually
 * handles today.
 */
export const GAME_ACTIONS = [
  'draw', // 413
  'exhaust', // 414
  'ready', // 415
  'recycle', // 416
  'deal', // 417
  'heal', // 418
  'play', // 419
  'move', // 420
  'hide', // 421
  'discard', // 422
  'stun', // 423
  'reveal', // 424
  'counter', // 425
  'buff', // 426
  'banish', // 427
  'kill', // 428
  'add', // 429
  'channel', // 430
  'burn-out', // 431
  'double', // 432
  'swap', // 433
  'attach', // 434
  'detach', // 435
  'predict', // 436
  'prevent', // 437
  'replace', // 438
  'create', // 439
  'burn', // 440
  'empower', // 441
  'disempower', // 442
  'skip', // 443
  'pay', // 444
] as const

export type GameAction = (typeof GAME_ACTIONS)[number]

/**
 * Control-flow atoms. Ours, not the rulebook's - they sequence Game Actions.
 *
 * There is no `seq`: an ability's steps are already an ordered list. `if-then`
 * and `modal` are not implemented yet and so are not listed; add them here with
 * the schema and interpreter together.
 */
export const CONTROL_OPS = ['choose', 'may', 'for-each'] as const

export type ControlOp = (typeof CONTROL_OPS)[number]

// ---------------------------------------------------------------------------
// Selectors — which objects a step acts on
// ---------------------------------------------------------------------------

/**
 * A reference to something a step acts on.
 *
 * Either a selector describing objects on the board, or `$name`: a binding made
 * earlier in the same ability by a `choose` step. Bindings are how targeting
 * works without the interpreter ever blocking — `choose` suspends the ability
 * with a PENDING_CHOICE and the player's answer fills the binding.
 */
export const bindingSchema = z
  .string()
  .regex(/^\$[a-z][a-z0-9-]*$/, 'a binding looks like `$victim`')

/**
 * What a selector picks out.
 *
 * `rune` is separate from `permanent` on purpose: Runes sit on the board but are
 * explicitly not Permanents, because they are not Main Deck cards (161.1.a).
 * Card text saying "permanent" must not catch them.
 */
export const objectKindSchema = z.enum(['unit', 'gear', 'rune', 'permanent', 'card', 'battlefield'])

export const selectorSchema = z.object({
  kind: objectKindSchema,
  /** Whose objects. Absent means any player's. */
  controller: z.enum(['self', 'opponent', 'any']).optional(),
  /**
   * Where to look. Absent means anywhere.
   *
   * `here` is the location the ability's source occupies — Battlefield text says
   * "here" to mean its own Battlefield (Silver Rule, 050). Units are always at a
   * Base or a Battlefield (146.1).
   */
  at: z.enum(['here', 'same-location', 'base', 'any-battlefield', 'anywhere']).optional(),
  /** Restrict to objects carrying this tag (143.1). Tags have no innate meaning (133.8.a). */
  tag: z.string().optional(),
  /** Restrict by Might, e.g. `{ max: 3 }` for "a unit with Might 3 or less". */
  might: z
    .object({ min: z.number().int().optional(), max: z.number().int().optional() })
    .optional(),
  /** How many to select. Absent means exactly one. */
  count: z.number().int().positive().optional(),
})

export type Selector = z.infer<typeof selectorSchema>

export const targetSchema = z.union([bindingSchema, selectorSchema])

export type Target = z.infer<typeof targetSchema>

/** A number that is either fixed, or counted from the board at resolution time. */
export const amountSchema = z.union([
  z.number().int(),
  // e.g. "deal damage equal to the number of allies here"
  z.object({ count: selectorSchema }),
])

export type Amount = z.infer<typeof amountSchema>

const who = z.enum(['self', 'opponent']).optional()

/**
 * Steps that do not contain other steps.
 *
 * Every optional field has a documented default that the interpreter applies;
 * `.optional()` is used rather than `.default()` so an authored card and a
 * parsed one have exactly the same type, which keeps the DSL honest.
 */
const leafStepSchema = z.discriminatedUnion('op', [
  // --- cards and resources ---
  // amount defaults to 1, who defaults to 'self'
  z.object({ op: z.literal('draw'), amount: amountSchema.optional(), who }),
  z.object({ op: z.literal('discard'), amount: amountSchema.optional(), who }),
  z.object({
    op: z.literal('recycle'),
    amount: amountSchema.optional(),
    from: z.enum(['hand', 'trash', 'base']).optional(), // defaults to 'hand'
  }),
  z.object({ op: z.literal('channel'), amount: amountSchema.optional() }),
  z.object({
    op: z.literal('add'),
    energy: z.number().int().nonnegative().optional(),
    power: z.array(z.enum(DOMAINS)).optional(),
    universal: z.number().int().nonnegative().optional(),
  }),

  // --- units ---
  z.object({ op: z.literal('deal'), amount: amountSchema, target: targetSchema }),
  z.object({ op: z.literal('heal'), target: targetSchema }),
  z.object({ op: z.literal('kill'), target: targetSchema }),
  z.object({ op: z.literal('banish'), target: targetSchema }),
  z.object({ op: z.literal('buff'), amount: amountSchema.optional(), target: targetSchema }),
  z.object({ op: z.literal('stun'), target: targetSchema }),
  z.object({ op: z.literal('exhaust'), target: targetSchema }),
  z.object({ op: z.literal('ready'), target: targetSchema }),

  /**
   * Bind an object for later steps to act on.
   *
   * Targeting never blocks the interpreter: `choose` suspends the ability with a
   * PENDING_CHOICE and the player's answer fills the binding. An `optional`
   * choice may be declined, leaving the binding empty and skipping the steps
   * that depend on it.
   */
  z.object({
    op: z.literal('choose'),
    as: bindingSchema,
    from: selectorSchema,
    optional: z.boolean().optional(),
  }),
])

type LeafStep = z.infer<typeof leafStepSchema>

/** A step, including the two that nest other steps. */
export type EffectStep =
  | LeafStep
  | { readonly op: 'may'; readonly steps: readonly EffectStep[] }
  | {
      readonly op: 'for-each'
      readonly of: Selector
      readonly as: string
      readonly steps: readonly EffectStep[]
    }

export const effectStepSchema: z.ZodType<EffectStep> = z.lazy(() =>
  z.union([
    leafStepSchema,
    z.object({ op: z.literal('may'), steps: z.array(effectStepSchema) }),
    z.object({
      op: z.literal('for-each'),
      of: selectorSchema,
      as: bindingSchema,
      steps: z.array(effectStepSchema),
    }),
  ]),
)

/** Ops the interpreter handles, derived from the schema so it cannot go stale. */
export const IMPLEMENTED_OPS: readonly string[] = [
  ...leafStepSchema.options.map((option) => option.shape.op.value),
  'may',
  'for-each',
]

export function isImplementedOp(op: string): boolean {
  return IMPLEMENTED_OPS.includes(op)
}
