/**
 * Rooms: the lobby where two players meet before a match.
 *
 * A host creates a room and gets a code, sends it to a friend, the friend joins
 * with it, both pick a deck and ready up. That is the whole flow — there is no
 * matchmaking queue yet, because on a small server a queue is usually empty
 * while your friend is waiting.
 *
 * This class knows nothing about sockets. A connection is just a `RoomClient`
 * with a `send`, which keeps every rule here testable with plain objects and
 * keeps the gateway a thin translation layer.
 *
 * All state is in memory. A room only matters while both players are
 * connected, so losing rooms on restart costs a re-join, not anyone's data.
 */

import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, normaliseRoomCode } from '@rb/protocol'
import type {
  ClientMessage,
  ErrorCode,
  PlayerIdentity,
  RoomStatus,
  RoomView,
  ServerMessage,
} from '@rb/protocol'
import { randomInt } from 'node:crypto'

export interface RoomClient {
  readonly identity: PlayerIdentity
  send(message: ServerMessage): void
}

/** Check a deck code. Returns null when acceptable, or a message saying why not. */
export type DeckCheck = (deck: string) => string | null

/** A room whose two players are both ready, handed to whoever runs matches. */
export interface StartingRoom {
  readonly code: string
  readonly players: readonly { readonly identity: PlayerIdentity; readonly deck: string }[]
}

export interface RoomManagerOptions {
  readonly checkDeck: DeckCheck
  /** Injected so tests can force collisions. Defaults to a cryptographic random code. */
  readonly generateCode?: () => string
  /** Injected so tests can move time. */
  readonly now?: () => number
  readonly onStart?: (room: StartingRoom) => void
  /**
   * How many wrong room codes a player may try per window.
   *
   * A code is ~30 bits, which is plenty against guessing *if* guessing is slow.
   * Without a limit a script could sweep codes and drop into strangers' rooms.
   */
  readonly joinAttempts?: { readonly max: number; readonly windowMs: number }
}

type LobbyMessage = Exclude<ClientMessage, { type: 'hello' } | { type: 'ping' }>

interface Seat {
  client: RoomClient
  deck: string
  ready: boolean
}

interface Room {
  readonly code: string
  /** Seat 0 is always the host. */
  readonly seats: Seat[]
  status: RoomStatus
}

/** A random room code from the unambiguous alphabet. */
export function generateRoomCode(): string {
  let code = ''
  for (let i = 0; i < ROOM_CODE_LENGTH; i += 1) {
    code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)]
  }
  return code
}

const MAX_PLAYERS = 2

export class RoomManager {
  private readonly rooms = new Map<string, Room>()
  /** Player id → the room they are in. A player is in at most one. */
  private readonly roomOfPlayer = new Map<string, Room>()
  /** Player id → timestamps of recent failed joins. */
  private readonly failedJoins = new Map<string, number[]>()

  private readonly checkDeck: DeckCheck
  private readonly generateCode: () => string
  private readonly now: () => number
  private readonly onStart: (room: StartingRoom) => void
  private readonly joinAttempts: { readonly max: number; readonly windowMs: number }

  constructor(options: RoomManagerOptions) {
    this.checkDeck = options.checkDeck
    this.generateCode = options.generateCode ?? generateRoomCode
    this.now = options.now ?? Date.now
    this.onStart = options.onStart ?? (() => undefined)
    this.joinAttempts = options.joinAttempts ?? { max: 10, windowMs: 60_000 }
  }

  /** Number of open rooms, for health reporting and tests. */
  get size(): number {
    return this.rooms.size
  }

  handle(client: RoomClient, message: LobbyMessage): void {
    switch (message.type) {
      case 'room.create':
        return this.create(client, message.deck)
      case 'room.join':
        return this.join(client, message.code, message.deck)
      case 'room.leave':
        return this.leave(client)
      case 'room.deck':
        return this.setDeck(client, message.deck)
      case 'room.ready':
        return this.setReady(client, message.ready)
    }
  }

  /**
   * A connection went away. The player leaves their room, exactly as if they
   * had asked to.
   *
   * Only if this connection still holds the seat, though: when a player
   * reconnects, the new connection takes the seat over first, and the old
   * socket closing afterwards must not kick them out.
   */
  disconnect(client: RoomClient): void {
    const room = this.roomOfPlayer.get(client.identity.id)
    if (!room) return
    const seat = room.seats.find((s) => s.client.identity.id === client.identity.id)
    if (seat?.client !== client) return
    this.leave(client, { silent: true })
  }

  /**
   * The same player connected again. The new connection takes over their seat
   * and is sent the room as it stands, so a dropped connection does not cost
   * anyone their place.
   */
  replace(previous: RoomClient, next: RoomClient): void {
    const room = this.roomOfPlayer.get(previous.identity.id)
    if (!room) return
    const seat = room.seats.find((s) => s.client === previous)
    if (!seat) return
    seat.client = next
    this.sendState(room, seat)
  }

  private create(client: RoomClient, deck: string): void {
    if (client.identity.kind === 'guest') {
      return this.fail(client, 'guests-cannot-host', 'Guests can join a room but not host one.')
    }
    if (this.roomOfPlayer.has(client.identity.id)) {
      return this.fail(client, 'already-in-room', 'Leave your current room first.')
    }
    if (!this.acceptDeck(client, deck)) return

    const code = this.uniqueCode()
    const room: Room = { code, seats: [{ client, deck, ready: false }], status: 'waiting' }
    this.rooms.set(code, room)
    this.roomOfPlayer.set(client.identity.id, room)
    this.broadcast(room)
  }

  private join(client: RoomClient, rawCode: string, deck: string): void {
    const id = client.identity.id
    if (this.roomOfPlayer.has(id)) {
      return this.fail(client, 'already-in-room', 'Leave your current room first.')
    }
    if (this.recentFailures(id) >= this.joinAttempts.max) {
      return this.fail(client, 'too-many-attempts', 'Too many wrong codes. Wait a minute.')
    }

    const room = this.rooms.get(normaliseRoomCode(rawCode))
    if (!room) {
      this.recordFailure(id)
      return this.fail(client, 'room-not-found', 'No room has that code.')
    }
    if (room.seats.length >= MAX_PLAYERS) {
      return this.fail(client, 'room-full', 'That room already has two players.')
    }
    if (!this.acceptDeck(client, deck)) return

    room.seats.push({ client, deck, ready: false })
    this.roomOfPlayer.set(id, room)
    this.updateStatus(room)
    this.broadcast(room)
  }

  private leave(client: RoomClient, options: { silent?: boolean } = {}): void {
    const room = this.roomOfPlayer.get(client.identity.id)
    if (!room) {
      if (!options.silent) this.fail(client, 'not-in-room', 'You are not in a room.')
      return
    }

    const index = room.seats.findIndex((s) => s.client.identity.id === client.identity.id)
    const [seat] = room.seats.splice(index, 1)
    this.roomOfPlayer.delete(client.identity.id)
    if (!options.silent) seat?.client.send({ type: 'room.closed', reason: 'left' })

    if (index === 0) {
      // The host is gone, and nobody else may host — guests cannot, and handing
      // a room to someone who only came to join is a surprise. Close it.
      for (const other of room.seats) {
        this.roomOfPlayer.delete(other.client.identity.id)
        other.client.send({ type: 'room.closed', reason: 'host-left' })
      }
      this.rooms.delete(room.code)
      return
    }

    // The host is alone again. Their ready flag stays as they set it.
    this.updateStatus(room)
    this.broadcast(room)
  }

  private setDeck(client: RoomClient, deck: string): void {
    const found = this.seatOf(client)
    if (!found) return
    const [room, seat] = found
    if (room.status === 'starting') {
      return this.fail(client, 'room-locked', 'The match is already starting.')
    }
    if (!this.acceptDeck(client, deck)) return
    seat.deck = deck
    // Readiness was for the previous deck.
    seat.ready = false
    this.updateStatus(room)
    this.broadcast(room)
  }

  private setReady(client: RoomClient, ready: boolean): void {
    const found = this.seatOf(client)
    if (!found) return
    const [room, seat] = found
    if (room.status === 'starting') {
      return this.fail(client, 'room-locked', 'The match is already starting.')
    }
    seat.ready = ready
    const status = this.updateStatus(room)
    this.broadcast(room)

    if (status === 'starting') {
      this.onStart({
        code: room.code,
        players: room.seats.map((s) => ({ identity: s.client.identity, deck: s.deck })),
      })
    }
  }

  private seatOf(client: RoomClient): [Room, Seat] | null {
    const room = this.roomOfPlayer.get(client.identity.id)
    const seat = room?.seats.find((s) => s.client.identity.id === client.identity.id)
    if (!room || !seat) {
      this.fail(client, 'not-in-room', 'You are not in a room.')
      return null
    }
    return [room, seat]
  }

  private acceptDeck(client: RoomClient, deck: string): boolean {
    const problem = this.checkDeck(deck)
    if (problem === null) return true
    this.fail(client, 'bad-deck', problem)
    return false
  }

  private updateStatus(room: Room): RoomStatus {
    if (room.seats.length < MAX_PLAYERS) room.status = 'waiting'
    else if (room.seats.every((s) => s.ready)) room.status = 'starting'
    else room.status = 'full'
    return room.status
  }

  private uniqueCode(): string {
    // With ~10^9 codes and a handful of rooms a collision is vanishingly rare,
    // but a bounded retry costs nothing and a silent overwrite would merge two
    // strangers into one room.
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const code = this.generateCode()
      if (!this.rooms.has(code)) return code
    }
    throw new Error('could not allocate a unique room code')
  }

  private recentFailures(playerId: string): number {
    const cutoff = this.now() - this.joinAttempts.windowMs
    const recent = (this.failedJoins.get(playerId) ?? []).filter((t) => t > cutoff)
    if (recent.length === 0) this.failedJoins.delete(playerId)
    else this.failedJoins.set(playerId, recent)
    return recent.length
  }

  private recordFailure(playerId: string): void {
    const list = this.failedJoins.get(playerId) ?? []
    list.push(this.now())
    this.failedJoins.set(playerId, list)
  }

  private view(room: Room, seatIndex: number): RoomView {
    return {
      code: room.code,
      status: room.status,
      seats: room.seats.map((s, i) => ({
        name: s.client.identity.name,
        kind: s.client.identity.kind,
        host: i === 0,
        ready: s.ready,
        // Whether a deck is chosen, never which one: decklists are private.
        hasDeck: s.deck.length > 0,
      })),
      yourSeat: seatIndex,
    }
  }

  private sendState(room: Room, seat: Seat): void {
    seat.client.send({ type: 'room.state', room: this.view(room, room.seats.indexOf(seat)) })
  }

  private broadcast(room: Room): void {
    for (const seat of room.seats) this.sendState(room, seat)
  }

  private fail(client: RoomClient, code: ErrorCode, message: string): void {
    client.send({ type: 'error', code, message })
  }
}
