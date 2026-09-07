/**
 * Keywords (800-829).
 *
 * A keyword is shorthand for a longer ability or instruction (135.2.c.1). Two of
 * them — Action and Reaction — are load-bearing for *timing* and must work before
 * any card that uses them: a Showdown State permits only Action or Reaction
 * (308.1.a), and a Closed State permits only Reaction (309.1.a).
 *
 * The rest are implemented on demand as the OGS set requires, each with its own
 * test. `IMPLEMENTED_KEYWORDS` is the honest record of what the engine actually
 * handles; anything outside it is rejected at card-load time rather than
 * silently ignored.
 */

/** Every keyword in the glossary (804-829). */
export const KEYWORDS = [
  'accelerate', // 805
  'action', // 806 - timing
  'assault', // 807
  'deathknell', // 808
  'deflect', // 809
  'ganking', // 810
  'hidden', // 811
  'legion', // 812
  'reaction', // 813 - timing
  'shield', // 814
  'tank', // 815
  'temporary', // 816
  'vision', // 817
  'equip', // 818
  'quick-draw', // 819
  'repeat', // 820
  'weaponmaster', // 821
  'ambush', // 822
  'hunt', // 823
  'level', // 824
  'unique', // 825
  'backline', // 826
  'empower', // 827
  'empowered', // 828
  'flow', // 829
] as const

export type Keyword = (typeof KEYWORDS)[number]

/**
 * Keywords that govern *when* a card or ability may be played, rather than what
 * it does. These change the legality of an action and cannot be deferred.
 */
export const TIMING_KEYWORDS = ['action', 'reaction'] as const satisfies readonly Keyword[]

export type TimingKeyword = (typeof TIMING_KEYWORDS)[number]

/**
 * Keywords the engine currently implements.
 *
 * Grows as cards need it. Keep it accurate — a keyword listed here without a
 * working implementation is worse than one that is absent, because card-lint
 * will wave the card through.
 */
export const IMPLEMENTED_KEYWORDS: readonly Keyword[] = ['action', 'reaction']

export function isKeyword(value: unknown): value is Keyword {
  return typeof value === 'string' && (KEYWORDS as readonly string[]).includes(value)
}

export function isImplemented(keyword: Keyword): boolean {
  return IMPLEMENTED_KEYWORDS.includes(keyword)
}

/**
 * Some keywords take a numeric value, written as `[Keyword] N`.
 *
 * Which ones do is set by each keyword's glossary entry; this list is filled in
 * as they are implemented rather than guessed at up front.
 */
export const VALUED_KEYWORDS: readonly Keyword[] = []

export function takesValue(keyword: Keyword): boolean {
  return VALUED_KEYWORDS.includes(keyword)
}
