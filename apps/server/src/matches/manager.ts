/**
 * Matches: the server-authoritative game between two players.
 *
 * A room hands over two players and their deck codes; this builds the game with
 * the engine and from then on is the only thing that changes it. Each player
 * sends one action at a time. The engine decides whether it is legal — this
 * class only makes sure a connection acts as its own seat and nobody else's —
 * and after every change each player is sent their own redacted view.
 *
 * Like rooms, matches live in memory and know nothing about sockets: a player is
 * a `RoomClient` with a `send`. A restart ends matches in progress; recovering
 * them from a stored action log comes later.
 *
 * A dropped connection is not a loss. The player has a grace period to come
 * back, and reconnecting picks the game up exactly where it was, because the
 * state never lived on the client.
 */

import { cardOracle } from '@rb/cards'
import { applyAction, createGame, decodeDeck, legalActions, redactFor } from '@rb/engine'
import type { CardOracle, DeckList, GameAction, GameState, PlayerId } from '@rb/engine'
import type { ClientMessage, MatchEndReason, PlayerIdentity } from '@rb/protocol'
import { randomInt, randomUUID } from 'node:crypto'

import type { RoomClient, StartingRoom } from '../rooms/manager.js'

export type Timer = (callback: () => void, ms: number) => () => void

export interface MatchManagerOptions {
  readonly oracle?: CardOracle
  /** Seed for a new game. Injected so tests can replay a known game. */
  readonly seed?: () => number
  readonly generateId?: () => string
  readonly now?: () => number
  readonly setTimer?: Timer
  /** How long a disconnected player has to come back before forfeiting. */
  readonly forfeitAfterMs?: number
  /** Called once a match is over, with how it ended. Persistence hooks in here. */
  readonly onEnd?: (summary: MatchSummary) => void
}

export interface MatchSummary {
  readonly id: string
  readonly players: readonly [PlayerIdentity, PlayerIdentity]
  readonly seed: number
  readonly winner: PlayerId | null
  readonly reason: MatchEndReason
  readonly actions: number
}

type MatchMessage = Extract<ClientMessage, { type: `match.${string}` }>

interface Seat {
  readonly identity: PlayerIdentity
  /** Null while this player is disconnected. */
  client: RoomClient | null
  cancelForfeit: (() => void) | null
}

interface Match {
  readonly id: string
  readonly seed: number
  readonly seats: [Seat, Seat]
  state: GameState
  seq: number
  actions: number
}

export const DEFAULT_FORFEIT_MS = 60_000

const defaultTimer: Timer = (callback, ms) => {
  const handle = setTimeout(callback, ms)
  return () => clearTimeout(handle)
}

export class MatchManager {
  private readonly matches = new Map<string, Match>()
  private readonly matchOfPlayer = new Map<string, Match>()

  private readonly oracle: CardOracle
  private readonly seed: () => number
  private readonly generateId: () => string
  private readonly now: () => number
  private readonly setTimer: Timer
  private readonly forfeitAfterMs: number
  private readonly onEnd: (summary: MatchSummary) => void

  constructor(options: MatchManagerOptions = {}) {
    this.oracle = options.oracle ?? cardOracle()
    this.seed = options.seed ?? (() => randomInt(2 ** 31))
    this.generateId = options.generateId ?? randomUUID
    this.now = options.now ?? Date.now
    this.setTimer = options.setTimer ?? defaultTimer
    this.forfeitAfterMs = options.forfeitAfterMs ?? DEFAULT_FORFEIT_MS
    this.onEnd = options.onEnd ?? (() => undefined)
  }

  /** Matches in progress, for health reporting and tests. */
  get size(): number {
    return this.matches.size
  }

  isPlaying(playerId: string): boolean {
    return this.matchOfPlayer.has(playerId)
  }

  /** Build a game from a room whose players are both ready. */
  start(room: StartingRoom): void {
    const [first, second] = room.players
    if (!first || !second) return
    const decks = [decode(first.deck), decode(second.deck)] as const
    if (!decks[0] || !decks[1]) return // the room already validated these

    const seed = this.seed()
    const match: Match = {
      id: this.generateId(),
      seed,
      // Room seat 0, the host, is engine player 0. Who goes first is the
      // engine's call, from the seed.
      seats: [
        { identity: first.identity, client: first.client, cancelForfeit: null },
        { identity: second.identity, client: second.client, cancelForfeit: null },
      ],
      state: createGame([decks[0], decks[1]], seed),
      seq: 0,
      actions: 0,
    }
    this.matches.set(match.id, match)
    this.matchOfPlayer.set(first.identity.id, match)
    this.matchOfPlayer.set(second.identity.id, match)

    for (const seat of [0, 1] as const) this.sendStarted(match, seat)
    this.broadcast(match)
  }

  handle(client: RoomClient, message: MatchMessage): void {
    const match = this.matchOfPlayer.get(client.identity.id)
    if (!match || match.id !== message.matchId) {
      return this.fail(client, 'not-in-match', 'That match is not running.')
    }
    const seat = this.seatOf(match, client.identity.id)
    if (seat === null) return

    // The seat comes from the connection, never from the message: a client
    // claiming to be the other player is simply acting as itself.
    const action = { ...message.action, player: seat } as GameAction
    const result = applyAction(match.state, action, this.oracle)
    if (!result.ok) {
      return this.fail(client, 'illegal-action', result.error.message)
    }

    match.state = result.state
    match.seq += 1
    match.actions += 1
    this.broadcast(match)

    if (match.state.winner !== null) {
      this.end(match, match.state.winner, action.type === 'concede' ? 'concede' : 'victory')
    }
  }

  /**
   * A player connected (or reconnected). If they are in a match, this
   * connection takes their seat and is sent the game as it stands.
   */
  attach(client: RoomClient): void {
    const match = this.matchOfPlayer.get(client.identity.id)
    if (!match) return
    const seat = this.seatOf(match, client.identity.id)
    if (seat === null) return
    const place = match.seats[seat]

    const wasAway = place.client === null
    place.client = client
    place.cancelForfeit?.()
    place.cancelForfeit = null

    this.sendStarted(match, seat)
    this.sendState(match, seat)
    if (wasAway) this.tellOpponent(match, seat, null)
  }

  /**
   * A connection closed. The player keeps their seat for the grace period; if
   * they are not back by then, they forfeit.
   *
   * Only when this connection still holds the seat: a reconnect attaches the
   * new connection first, and the old socket closing afterwards changes nothing.
   */
  disconnect(client: RoomClient): void {
    const match = this.matchOfPlayer.get(client.identity.id)
    if (!match) return
    const seat = this.seatOf(match, client.identity.id)
    if (seat === null) return
    const place = match.seats[seat]
    if (place.client !== client) return

    place.client = null
    const forfeitAt = this.now() + this.forfeitAfterMs
    place.cancelForfeit = this.setTimer(() => {
      place.cancelForfeit = null
      if (this.matches.get(match.id) !== match) return
      this.end(match, other(seat), 'abandoned')
    }, this.forfeitAfterMs)
    this.tellOpponent(match, seat, forfeitAt)
  }

  private end(match: Match, winner: PlayerId | null, reason: MatchEndReason): void {
    if (this.matches.get(match.id) !== match) return
    this.matches.delete(match.id)
    for (const place of match.seats) {
      place.cancelForfeit?.()
      place.cancelForfeit = null
      this.matchOfPlayer.delete(place.identity.id)
      place.client?.send({ type: 'match.ended', matchId: match.id, winner, reason })
    }
    this.onEnd({
      id: match.id,
      players: [match.seats[0].identity, match.seats[1].identity],
      seed: match.seed,
      winner,
      reason,
      actions: match.actions,
    })
  }

  private sendStarted(match: Match, seat: PlayerId): void {
    const [a, b] = match.seats
    match.seats[seat].client?.send({
      type: 'match.started',
      matchId: match.id,
      seat,
      players: [
        { name: a.identity.name, kind: a.identity.kind },
        { name: b.identity.name, kind: b.identity.kind },
      ],
    })
  }

  private sendState(match: Match, seat: PlayerId): void {
    match.seats[seat].client?.send({
      type: 'match.state',
      matchId: match.id,
      seq: match.seq,
      // Each player's own view: hidden cards are absent, not masked.
      view: redactFor(match.state, seat),
      legal: legalActions(match.state, seat, this.oracle),
    })
  }

  private broadcast(match: Match): void {
    this.sendState(match, 0)
    this.sendState(match, 1)
  }

  private tellOpponent(match: Match, awaySeat: PlayerId, forfeitAt: number | null): void {
    match.seats[other(awaySeat)].client?.send({
      type: 'match.opponent-away',
      matchId: match.id,
      forfeitAt,
    })
  }

  private seatOf(match: Match, playerId: string): PlayerId | null {
    if (match.seats[0].identity.id === playerId) return 0
    if (match.seats[1].identity.id === playerId) return 1
    return null
  }

  private fail(client: RoomClient, code: 'not-in-match' | 'illegal-action', message: string): void {
    client.send({ type: 'error', code, message })
  }
}

function other(seat: PlayerId): PlayerId {
  return seat === 0 ? 1 : 0
}

function decode(code: string): DeckList | null {
  const decoded = decodeDeck(code)
  return decoded.ok ? decoded.deck : null
}
