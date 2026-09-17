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

import { CARD_TYPES } from '../model/card.js'
import { DOMAINS } from '../model/domain.js'
import { KEYWORDS } from '../model/keyword.js'

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

export type GameActionName = (typeof GAME_ACTIONS)[number]

/**
 * Control-flow atoms. Ours, not the rulebook's - they sequence Game Actions.
 *
 * There is no `seq`: an ability's steps are already an ordered list. `modal` is
 * not implemented yet and so is not listed; add it here with the schema and
 * interpreter together.
 */
export const CONTROL_OPS = ['choose', 'may', 'for-each', 'if', 'repeat'] as const

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
 * The ability's own source, for card text that says "me" ("give me +3 [M]").
 *
 * Always bound, so no step may bind it; see `newBindingSchema`.
 */
export const SELF_BINDING = '$me'

/** A binding a step creates. Anything but the reserved `$me`. */
const newBindingSchema = bindingSchema.refine((name) => name !== SELF_BINDING, {
  message: '`$me` always means the source and cannot be bound',
})

/**
 * What a selector picks out.
 *
 * `rune` is separate from `permanent` on purpose: Runes sit on the board but are
 * explicitly not Permanents, because they are not Main Deck cards (161.1.a).
 * Card text saying "permanent" must not catch them.
 */
export const objectKindSchema = z.enum([
  'unit',
  'gear',
  'spell',
  'rune',
  'permanent',
  'card',
  'battlefield',
])

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
  at: z
    .union([
      z.enum(['here', 'same-location', 'base', 'any-battlefield', 'anywhere']),
      /**
       * Where a bound object is: a Battlefield bound by an earlier `choose` ("…at
       * a battlefield"), or the Location of a bound unit ("the only unit you
       * control there").
       */
      bindingSchema,
    ])
    .optional(),
  /** Restrict to objects carrying this tag (143.1). Tags have no innate meaning (133.8.a). */
  tag: z.string().optional(),
  /** Restrict by Might, e.g. `{ max: 3 }` for "a unit with Might 3 or less". */
  might: z
    .object({ min: z.number().int().optional(), max: z.number().int().optional() })
    .optional(),
  /** How many to select. Absent means exactly one. */
  count: z.number().int().positive().optional(),
  /**
   * Look in a player zone instead of on the board: "a unit from your trash",
   * "discard 1" (a card in hand). `controller` then means whose zone it is,
   * since a card off the board is controlled by its owner.
   */
  zone: z.enum(['hand', 'trash', 'runeDeck']).optional(),
  /** Only units with an Attacker or Defender designation: "units in combat". */
  inCombat: z.boolean().optional(),
  /** Only exhausted objects (true) or only ready ones (false). Absent means either. */
  exhausted: z.boolean().optional(),
  /** "Another": never the ability's own source. */
  other: z.boolean().optional(),
})

export type Selector = z.infer<typeof selectorSchema>

/**
 * Conditions a triggered ability can carry beyond its event (383.2.a.1).
 *
 * Deliberately a short list, grown as cards need it.
 */
export const triggerConditionSchema = z.discriminatedUnion('kind', [
  /** "When I move to a battlefield" - where the move ended. */
  z.object({ kind: z.literal('moved-to-battlefield') }),
  /** "When you play a spell that costs [N] or more" - the printed Energy cost. */
  z.object({ kind: z.literal('spell-cost-at-least'), energy: z.number().int().nonnegative() }),
  /** "If you have N+ units at that battlefield" - the Battlefield the event names. */
  z.object({
    kind: z.literal('units-at-battlefield-at-least'),
    count: z.number().int().positive(),
  }),
])

export type TriggerCondition = z.infer<typeof triggerConditionSchema>

/**
 * What a passive ability does, for the passives the engine understands.
 *
 * A passive is not executed (363): the engine consults it at the moment it
 * matters. Deliberately a short list, grown as cards need it.
 */
/**
 * A condition a passive holds under ("while ..."), checked whenever it matters.
 */
export const passiveConditionSchema = z.discriminatedUnion('kind', [
  /** "While you have 8+ runes": a count from the source's controller's view. */
  z.object({
    kind: z.literal('count'),
    of: selectorSchema,
    atLeast: z.number().int().nonnegative().optional(),
    atMost: z.number().int().nonnegative().optional(),
  }),
  /**
   * "While I'm attacking or defending alone": the affected unit holds a combat
   * designation (of this role, if given) and no other unit its controller
   * controls there holds the same one.
   */
  z.object({
    kind: z.literal('alone-in-combat'),
    role: z.enum(['attacker', 'defender']).optional(),
  }),
  /** "While I'm at a battlefield": the passive's own source. */
  z.object({ kind: z.literal('at-battlefield') }),
])

export type PassiveCondition = z.infer<typeof passiveConditionSchema>

/** Whom a passive affects: its source ("I have ..."), or what a selector picks out. */
const affectsSchema = z.union([
  z.literal('me'),
  selectorSchema.refine((selector) => selector.might === undefined, {
    message: 'a passive cannot pick units by Might: Might is what passives change',
  }),
])

export const passiveEffectSchema = z.discriminatedUnion('kind', [
  /**
   * "I enter ready." Replaces entering exhausted (143.4) rather than readying
   * afterwards, so nothing that cares about becoming ready fires (805.6.a).
   */
  z.object({ kind: z.literal('enters-ready') }),
  /**
   * "You may play me to an open battlefield": one that is unoccupied and
   * uncontrolled (170.11.c) becomes a valid place to play this unit (355.2.b).
   */
  z.object({ kind: z.literal('play-to-open-battlefield') }),
  /**
   * "I have +2 [M]", "Units here have +1 [M]": Might in the Arithmetic layer
   * (477.3) while the source is in play and every condition holds. Not
   * snapshotted, since it comes from a passive (477.3.b): it follows the board.
   */
  z.object({
    kind: z.literal('might'),
    amount: z.number().int(),
    to: affectsSchema,
    while: z.array(passiveConditionSchema).optional(),
  }),
  /**
   * Bonus Damage (712): each Deal from a spell or ability deals this much more.
   * `dealtBy: 'self'` limits it to its controller's spells and abilities
   * ("your spells"); `to` limits it to what is being dealt damage ("units
   * here"). Instances add up (714).
   */
  /**
   * "The Energy costs for spells you play are reduced by [1], to a minimum of
   * [1]" (356.4). The minimum limits only this discount (356.4.e).
   */
  z.object({
    kind: z.literal('spell-cost-reduction'),
    energy: z.number().int().positive(),
    minimum: z.number().int().nonnegative(),
    while: z.array(passiveConditionSchema).optional(),
  }),
  z.object({
    kind: z.literal('bonus-damage'),
    amount: z.number().int().positive(),
    dealtBy: z.literal('self').optional(),
    to: selectorSchema.optional(),
  }),
  /**
   * "Units here have [Ganking]": a keyword held while the object is where the
   * passive reaches it (801.3.a.3 for one given with no duration). Values add
   * to anything printed, as granted keywords do (807.2, 814.2).
   */
  z.object({
    kind: z.literal('keyword'),
    keyword: z.enum(KEYWORDS),
    value: z.number().int().positive().optional(),
    to: affectsSchema,
    while: z.array(passiveConditionSchema).optional(),
  }),
  /**
   * "Units can't move from here to base": a Destination made invalid for the
   * units the passive reaches (447.2). It applies to every Move, a Standard
   * Move and one caused by an effect alike (420.1), but never to a Recall,
   * which is not a Move (456.3).
   */
  z.object({
    kind: z.literal('restrict-move'),
    of: affectsSchema,
    to: z.literal('base'),
  }),
  /**
   * "Increase the points needed to win the game by 1" (466.2): the Victory
   * Score itself moves, so nothing else about scoring changes.
   */
  z.object({ kind: z.literal('points-to-win'), amount: z.number().int() }),
])

export type PassiveEffect = z.infer<typeof passiveEffectSchema>

export const targetSchema = z.union([bindingSchema, selectorSchema])

export type Target = z.infer<typeof targetSchema>

/**
 * What an `if` step checks, at the moment it runs.
 *
 * Deliberately a short list, grown as cards need it.
 */
export const stepConditionSchema = z.discriminatedUnion('kind', [
  /**
   * How many objects match, e.g. "if it is the only unit you control there"
   * (`atMost: 1`) or "if you can channel" (a rune left in your Rune Deck).
   */
  z.object({
    kind: z.literal('count'),
    of: selectorSchema,
    atLeast: z.number().int().nonnegative().optional(),
    atMost: z.number().int().nonnegative().optional(),
  }),
  /**
   * "If this kills it": the object bound earlier is no longer on the board.
   * False if nothing was bound, since then nothing was killed.
   */
  z.object({ kind: z.literal('left-board'), target: bindingSchema }),
  /** "If you do": an earlier choice, such as an optional additional cost, was made. */
  z.object({ kind: z.literal('chosen'), binding: bindingSchema }),
])

export type StepCondition = z.infer<typeof stepConditionSchema>

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
  /** Put chosen cards from their owner's hand into the trash (422). */
  z.object({ op: z.literal('discard'), target: targetSchema }),
  /**
   * Put cards on the bottom of their owner's deck (416): runes to the Rune
   * Deck, anything else to the Main Deck.
   */
  z.object({ op: z.literal('recycle'), target: targetSchema }),
  /**
   * Predict (436): look at the top card of your Main Deck, and you may recycle
   * it. The player is asked, and sees the card.
   */
  z.object({ op: z.literal('predict') }),
  /**
   * Channel runes from the top of the Rune Deck (430), readied by default
   * (430.2.a) or `exhausted: true` for "channel 1 rune exhausted".
   */
  z.object({
    op: z.literal('channel'),
    amount: amountSchema.optional(),
    exhausted: z.boolean().optional(),
  }),
  z.object({
    op: z.literal('add'),
    energy: z.number().int().nonnegative().optional(),
    power: z.array(z.enum(DOMAINS)).optional(),
    universal: z.number().int().nonnegative().optional(),
    /**
     * Restrict what the added resources may pay for, e.g. `['spell']` for
     * "Use only to play spells". Absent means unrestricted.
     */
    onlyFor: z.array(z.enum(CARD_TYPES)).optional(),
  }),

  // --- units ---
  z.object({ op: z.literal('deal'), amount: amountSchema, target: targetSchema }),
  z.object({ op: z.literal('heal'), target: targetSchema }),
  z.object({ op: z.literal('kill'), target: targetSchema }),
  /**
   * Return cards to their owner's hand, from the board ("return a unit at a
   * battlefield") or a zone ("return a unit from your trash"). Leaving the
   * board clears damage, Buffs and statuses like any other zone change.
   */
  z.object({ op: z.literal('return-to-hand'), target: targetSchema }),
  z.object({ op: z.literal('banish'), target: targetSchema }),
  z.object({ op: z.literal('buff'), amount: amountSchema.optional(), target: targetSchema }),
  z.object({ op: z.literal('stun'), target: targetSchema }),
  z.object({ op: z.literal('exhaust'), target: targetSchema }),
  z.object({ op: z.literal('ready'), target: targetSchema }),

  /**
   * Move units by an effect (420, 449) - not a Standard Move, so it costs
   * nothing and the units stay as ready or exhausted as they were.
   *
   * `to: 'base'` is each unit's controller's Base. A unit already there does
   * not move: a Move needs a different Destination (447).
   */
  z.object({ op: z.literal('move'), target: targetSchema, to: z.literal('base') }),

  /**
   * Create and play unit tokens (439, 185.2.a): "play a 1 [M] Recruit unit
   * token here". `token` is the token's card id. `to` is its controller's
   * Base, the source's Location (`here`), or a Battlefield bound by an earlier
   * `choose` (falling back to Base when nothing was chosen). They enter as
   * played units do: exhausted, unless its player's units enter ready.
   */
  z.object({
    op: z.literal('play-token'),
    token: z.string().min(1),
    count: z.number().int().positive().optional(),
    to: z.union([z.enum(['base', 'here']), bindingSchema]),
  }),

  /**
   * "It gains [Shield 2] this combat": a keyword on the unit until the combat
   * ends. Values add to any it already has (807.2, 814.2).
   */
  z.object({
    op: z.literal('grant-keyword'),
    keyword: z.enum(KEYWORDS),
    value: z.number().int().positive().optional(),
    target: targetSchema,
    duration: z.literal('this-combat'),
  }),

  /**
   * "They deal damage equal to their Mights to each other": both amounts are
   * worked out first, then dealt, so neither unit dying changes the other's.
   */
  z.object({ op: z.literal('deal-each-other'), a: bindingSchema, b: bindingSchema }),

  /**
   * "The next time it dies this turn, recall it exhausted instead" - a
   * replacement effect on its death (438, 370). A Recall is not a Move (456),
   * and leaves its damage where it is (458.1).
   */
  z.object({
    op: z.literal('recall-instead-of-dying'),
    target: targetSchema,
    duration: z.literal('this-turn'),
  }),

  /**
   * "As an additional cost to play this, you may exhaust a friendly unit":
   * chosen and paid as the card is played (355.1.a, 357), not as it resolves.
   * `as` records what was exhausted, for an `if` with a `chosen` condition.
   */
  z.object({
    op: z.literal('additional-cost'),
    as: newBindingSchema,
    exhaust: selectorSchema,
    optional: z.literal(true),
  }),

  /** "Units you play this turn enter ready." Expires with the turn (317.2.c). */
  z.object({ op: z.literal('units-enter-ready'), duration: z.literal('this-turn') }),

  /**
   * "Give a unit +2 [M] this turn" - a Might modifier, not a Game Action.
   *
   * Not `buff`: a Buff is a counter that stays until the unit leaves the board
   * (702), while this is an arithmetic layer effect (477.3) that expires in the
   * Expiration Step (317.2.c). `amount` may be negative ("-1 [M]").
   *
   * `minimum` is "to a minimum of N": the decrease is limited when it is
   * applied, and stays at that limited size for the rest of the turn (477.3.b).
   */
  z.object({
    op: z.literal('give-might'),
    amount: amountSchema,
    target: targetSchema,
    /**
     * `while-on-board` for card text that gives Might with no duration: it
     * stays until the unit leaves the board, as a keyword given with no
     * duration does (801.3.a.3).
     */
    duration: z.enum(['this-turn', 'while-on-board']),
    minimum: z.number().int().optional(),
  }),

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
    as: newBindingSchema,
    from: selectorSchema,
    optional: z.boolean().optional(),
  }),

  /**
   * "You win the game" (466.4): the ability's controller wins where they
   * stand, without going through the Victory Score.
   */
  z.object({ op: z.literal('win-game') }),
])

type LeafStep = z.infer<typeof leafStepSchema>

/** A step, including the ones that nest other steps. */
export type EffectStep =
  | LeafStep
  | { readonly op: 'may'; readonly steps: readonly EffectStep[] }
  | { readonly op: 'repeat'; readonly times: number; readonly steps: readonly EffectStep[] }
  | {
      readonly op: 'if'
      readonly condition: StepCondition
      readonly then: readonly EffectStep[]
      readonly else?: readonly EffectStep[] | undefined
    }
  | {
      readonly op: 'for-each'
      readonly of: Selector
      readonly as: string
      readonly steps: readonly EffectStep[]
    }

export const effectStepSchema: z.ZodType<EffectStep> = z.lazy(() =>
  z.union([
    leafStepSchema,
    /**
     * "You may ...": the ability's controller answers yes or no, and the steps
     * run only on yes.
     */
    z.object({ op: z.literal('may'), steps: z.array(effectStepSchema) }),
    /** Run the steps this many times, e.g. once for each of four tokens. */
    z.object({
      op: z.literal('repeat'),
      times: z.number().int().positive(),
      steps: z.array(effectStepSchema),
    }),
    /** "If ..., ... (otherwise ...)", checked when the step is reached. */
    z.object({
      op: z.literal('if'),
      condition: stepConditionSchema,
      then: z.array(effectStepSchema),
      else: z.array(effectStepSchema).optional(),
    }),
    z.object({
      op: z.literal('for-each'),
      of: selectorSchema,
      as: newBindingSchema,
      steps: z.array(effectStepSchema),
    }),
  ]),
)

/** Ops the interpreter handles, derived from the schema so it cannot go stale. */
export const IMPLEMENTED_OPS: readonly string[] = [
  ...leafStepSchema.options.map((option) => option.shape.op.value),
  'may',
  'for-each',
  'if',
  'repeat',
]

export function isImplementedOp(op: string): boolean {
  return IMPLEMENTED_OPS.includes(op)
}
