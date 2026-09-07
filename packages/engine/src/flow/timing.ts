/**
 * When a card or ability may be played (308-310, 358.4).
 *
 * The permissions stack, narrowest last:
 *
 *   - **Closed State** (a Chain exists) — only Reaction (309.1.a).
 *   - **Showdown State** — only Action or Reaction (308.1.a).
 *   - **Neutral Open** — anything, but only the Turn Player, on their turn, in
 *     their Main Phase (310.1.a, 316.5.b).
 *
 * Checked here rather than inline so `legalActions` and the legality step of
 * playing a card (358.4) cannot disagree about what is playable.
 */

import type { Keyword } from '../model/keyword.js'
import type { GameState, PlayerId } from '../state/game-state.js'
import { isClosedState, isShowdownState } from '../state/game-state.js'

export type TimingRefusal = 'no-priority' | 'needs-reaction' | 'needs-action' | 'not-your-main'

/**
 * Why this cannot be played right now, or `null` if it can.
 *
 * Returns the reason rather than a boolean so the client can say *why* a card is
 * greyed out, which is most of the difference between a readable game and a
 * frustrating one.
 */
export function timingRefusal(
  state: GameState,
  player: PlayerId,
  keywords: readonly Keyword[],
): TimingRefusal | null {
  if (state.priority !== player) return 'no-priority'

  // A Chain is the narrowest window: only Reaction gets in (309.1.a).
  if (isClosedState(state)) {
    return keywords.includes('reaction') ? null : 'needs-reaction'
  }

  // During a Showdown, Action or Reaction (308.1.a).
  if (isShowdownState(state)) {
    return keywords.includes('action') || keywords.includes('reaction') ? null : 'needs-action'
  }

  // Neutral Open: the Turn Player's own Main Phase (310.1.a, 316.5.b).
  if (state.turnPlayer !== player || state.phase !== 'main') return 'not-your-main'
  return null
}

export function canPlayNow(
  state: GameState,
  player: PlayerId,
  keywords: readonly Keyword[],
): boolean {
  return timingRefusal(state, player, keywords) === null
}
