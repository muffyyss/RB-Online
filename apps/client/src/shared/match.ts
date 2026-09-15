/**
 * The client's picture of a match, rebuilt from server messages.
 *
 * The client never computes game state. It keeps the last view the server sent
 * and the actions the server said are legal, and turns clicks into those
 * actions. Pure functions, so the rules of "which update wins" are testable
 * without a window.
 */

import type { GameAction, GameView, Location, ObjectId, PlayerId } from '@rb/engine'
import type { MatchEndReason, MatchPlayer, ServerMessage } from '@rb/protocol'

export interface MatchSession {
  readonly id: string
  readonly seat: PlayerId
  readonly players: readonly [MatchPlayer, MatchPlayer]
  /** Null only between `match.started` and the first `match.state`. */
  readonly view: GameView | null
  readonly legal: readonly GameAction[]
  readonly seq: number
  readonly ended: { readonly winner: PlayerId | null; readonly reason: MatchEndReason } | null
  /** When the opponent forfeits if they stay away, or null while they are here. */
  readonly opponentAwayUntil: number | null
}

/** Fold one server message into the session. Unrelated messages change nothing. */
export function reduceMatch(
  current: MatchSession | null,
  message: ServerMessage,
): MatchSession | null {
  switch (message.type) {
    case 'match.started':
      // The same match again means we reconnected: keep what we had until the
      // fresh state arrives, so the board does not blink empty.
      if (current?.id === message.matchId && !current.ended) {
        return { ...current, seat: message.seat, players: message.players }
      }
      return {
        id: message.matchId,
        seat: message.seat,
        players: message.players,
        view: null,
        legal: [],
        seq: -1,
        ended: null,
        opponentAwayUntil: null,
      }

    case 'match.state':
      if (current?.id !== message.matchId) return current
      // Updates can arrive late after a reconnect; an older one must never
      // overwrite a newer board.
      if (message.seq < current.seq) return current
      return { ...current, view: message.view, legal: message.legal, seq: message.seq }

    case 'match.ended':
      if (current?.id !== message.matchId) return current
      return {
        ...current,
        legal: [],
        ended: { winner: message.winner, reason: message.reason },
        opponentAwayUntil: null,
      }

    case 'match.opponent-away':
      if (current?.id !== message.matchId) return current
      return { ...current, opponentAwayUntil: message.forfeitAt }

    default:
      return current
  }
}

// ---------------------------------------------------------------------------
// Reading the legal actions
// ---------------------------------------------------------------------------

export function canPlay(legal: readonly GameAction[], card: ObjectId): boolean {
  return legal.some((a) => a.type === 'play-card' && a.card === card)
}

/**
 * The legal ways to play a card: one per place a unit may enter (355.2). The
 * plain play (to Base, or anything that is not a unit) comes first.
 */
export function playsOf(
  legal: readonly GameAction[],
  card: ObjectId,
): readonly Extract<GameAction, { type: 'play-card' }>[] {
  return legal.flatMap((a) => (a.type === 'play-card' && a.card === card ? [a] : []))
}

export function abilitiesOf(legal: readonly GameAction[], source: ObjectId): readonly string[] {
  return legal.flatMap((a) =>
    a.type === 'activate-ability' && a.source === source ? [a.abilityId] : [],
  )
}

export function movesOf(legal: readonly GameAction[], unit: ObjectId): readonly Location[] {
  return legal.flatMap((a) =>
    a.type === 'move' && a.units.length === 1 && a.units[0] === unit ? [a.to] : [],
  )
}

export function canPass(legal: readonly GameAction[]): boolean {
  return legal.some((a) => a.type === 'pass')
}

export function mustMulligan(legal: readonly GameAction[]): boolean {
  return legal.some((a) => a.type === 'mulligan')
}

export function mustChoose(legal: readonly GameAction[]): boolean {
  return legal.some((a) => a.type === 'resolve-choice')
}

/** Is this seat waiting on the other player (and not on us)? */
export function waitingOnOpponent(session: MatchSession): boolean {
  return !session.ended && session.legal.every((a) => a.type === 'concede')
}

/** Objects at a location, in a stable order. */
export function objectsAt(view: GameView, location: Location): readonly ObjectId[] {
  return Object.values(view.objects)
    .filter((object) => {
      const at = object.location
      if (!at || at.kind !== location.kind) return false
      return at.kind === 'base'
        ? location.kind === 'base' && at.player === location.player
        : location.kind === 'battlefield' && at.id === location.id
    })
    .map((object) => object.id)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
}
