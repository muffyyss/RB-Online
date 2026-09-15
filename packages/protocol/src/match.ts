/**
 * The match protocol: playing a game once a room has started one.
 *
 * The server holds the only real game state. After every change it sends each
 * player **their own redacted view** (`redactFor` in the engine) plus the
 * actions they may take right now. Nothing else crosses the wire: no events, no
 * full state, no RNG — a card the viewer may not see is absent from the payload,
 * not hidden by the client.
 *
 * A client sends one action at a time. The `player` it names is ignored; the
 * server always acts as the seat the connection belongs to, so a client cannot
 * move for its opponent by lying about who it is.
 */

import type { GameAction, GameView } from '@rb/engine'
import { z } from 'zod'

import type { PlayerKind } from './room.js'

const objectId = z.string().min(1).max(64)
const player = z.union([z.literal(0), z.literal(1)])

const location = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('base'), player }),
  z.object({ kind: z.literal('battlefield'), id: objectId }),
])

/** Structural check of an engine action. Legality is the engine's job, not this schema's. */
export const gameActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('pass'), player }),
  z.object({
    type: z.literal('resolve-choice'),
    player,
    chosen: z.array(objectId).max(40).readonly(),
  }),
  z.object({ type: z.literal('play-card'), player, card: objectId, to: location.optional() }),
  z.object({
    type: z.literal('activate-ability'),
    player,
    source: objectId,
    abilityId: z.string().min(1).max(128),
  }),
  z.object({
    type: z.literal('move'),
    player,
    units: z.array(objectId).min(1).max(40).readonly(),
    to: location,
  }),
  z.object({ type: z.literal('mulligan'), player, setAside: z.array(objectId).max(4).readonly() }),
  z.object({ type: z.literal('concede'), player }),
])

export const matchClientMessages = [
  z.object({
    type: z.literal('match.action'),
    matchId: z.string().min(1).max(64),
    action: gameActionSchema,
  }),
] as const

export interface MatchPlayer {
  readonly name: string
  readonly kind: PlayerKind
}

export type MatchEndReason =
  /** Someone reached the Victory Score. */
  | 'victory'
  | 'concede'
  /** A player stayed disconnected past the grace period. */
  | 'abandoned'

export type MatchServerMessage =
  | {
      readonly type: 'match.started'
      readonly matchId: string
      /** Which seat in the view is yours: 0 or 1. */
      readonly seat: 0 | 1
      readonly players: readonly [MatchPlayer, MatchPlayer]
    }
  | {
      readonly type: 'match.state'
      readonly matchId: string
      /** Increases with every change, so a client can ignore a stale update. */
      readonly seq: number
      readonly view: GameView
      /**
       * What you may do now. Choices and mulligans come as templates with an
       * empty selection, which the client fills from the view.
       */
      readonly legal: readonly GameAction[]
    }
  | {
      readonly type: 'match.ended'
      readonly matchId: string
      readonly winner: 0 | 1 | null
      readonly reason: MatchEndReason
    }
  | {
      /** Your opponent's connection dropped; the match ends if they do not return in time. */
      readonly type: 'match.opponent-away'
      readonly matchId: string
      /** Epoch milliseconds at which the match is forfeited, or null once they are back. */
      readonly forfeitAt: number | null
    }
