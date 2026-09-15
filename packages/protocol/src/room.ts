/**
 * The lobby protocol: creating, joining and readying up in a room.
 *
 * Everything travels over one WebSocket as JSON objects with a `type`. Client
 * messages are validated with the schemas here before the server looks at
 * them; server messages are plain types, since the client trusts its server.
 *
 * What is *not* sent is as deliberate as what is: a player never receives the
 * other seat's deck code, only whether one has been chosen. Decklists are
 * private information (rule 129.3), and a room is no exception.
 */

import { z } from 'zod'

import { matchClientMessages } from './match.js'
import type { MatchServerMessage } from './match.js'

/**
 * Room code characters: capitals and digits without the ones people misread
 * when a code is read out over voice chat — no I/1, no O/0.
 */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const ROOM_CODE_LENGTH = 6

/**
 * Normalise a typed room code: trim, uppercase, and drop the spaces or hyphens
 * people add when they copy one out of a chat message.
 */
export function normaliseRoomCode(code: string): string {
  return code.trim().toUpperCase().replace(/[\s-]/g, '')
}

/** Deck codes are short; anything past this is not a deck. */
export const DECK_CODE_MAX = 2000

const deckCodeSchema = z.string().min(1).max(DECK_CODE_MAX)

export const clientMessageSchema = z.discriminatedUnion('type', [
  /** First message on every connection. Nothing else is accepted before it. */
  z.object({
    type: z.literal('hello'),
    protocol: z.number().int(),
    accessToken: z.string().min(1).max(4096),
  }),
  /** Registered players only; guests can join but not host. */
  z.object({ type: z.literal('room.create'), deck: deckCodeSchema }),
  z.object({ type: z.literal('room.join'), code: z.string().min(1).max(32), deck: deckCodeSchema }),
  z.object({ type: z.literal('room.leave') }),
  /** Switch preset while waiting. Un-readies the player. */
  z.object({ type: z.literal('room.deck'), deck: deckCodeSchema }),
  z.object({ type: z.literal('room.ready'), ready: z.boolean() }),
  z.object({ type: z.literal('ping') }),
  ...matchClientMessages,
])

export type ClientMessage = z.infer<typeof clientMessageSchema>

export type PlayerKind = 'user' | 'guest'

export interface PlayerIdentity {
  readonly id: string
  readonly name: string
  readonly kind: PlayerKind
}

/**
 * - `waiting`  — the host is alone.
 * - `full`     — both seats taken, not everyone ready.
 * - `starting` — both ready; the match is being set up.
 */
export type RoomStatus = 'waiting' | 'full' | 'starting'

export interface SeatView {
  readonly name: string
  readonly kind: PlayerKind
  readonly host: boolean
  readonly ready: boolean
  /** Whether a deck is chosen. Never the deck itself. */
  readonly hasDeck: boolean
}

export interface RoomView {
  readonly code: string
  readonly status: RoomStatus
  readonly seats: readonly SeatView[]
  /** Which of `seats` is the player receiving this view. */
  readonly yourSeat: number
}

export type RoomClosedReason =
  /** The host left, so the room is gone. */
  | 'host-left'
  /** You left it yourself. */
  | 'left'
  /** Both players were ready: the room is gone and the match has begun. */
  | 'match-started'

export type ErrorCode =
  | 'bad-message'
  | 'not-authenticated'
  | 'protocol-mismatch'
  | 'guests-cannot-host'
  | 'already-in-room'
  | 'not-in-room'
  | 'room-not-found'
  | 'room-full'
  | 'bad-deck'
  | 'too-many-attempts'
  /** Finish (or concede) the match you are in first. */
  | 'in-match'
  | 'not-in-match'
  /** The engine refused the action; the message says why. */
  | 'illegal-action'
  | 'replaced'

export type ServerMessage =
  | { readonly type: 'welcome'; readonly you: PlayerIdentity }
  | { readonly type: 'room.state'; readonly room: RoomView }
  | { readonly type: 'room.closed'; readonly reason: RoomClosedReason }
  | { readonly type: 'error'; readonly code: ErrorCode; readonly message: string }
  | { readonly type: 'pong' }
  | MatchServerMessage
