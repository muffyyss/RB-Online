import { beforeEach, describe, expect, it } from 'vitest'

import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@rb/protocol'
import type { PlayerKind, RoomView, ServerMessage } from '@rb/protocol'

import { checkDeckCode } from '../src/rooms/deck.js'
import { RoomManager, generateRoomCode } from '../src/rooms/manager.js'
import type { RoomClient, RoomManagerOptions, StartingRoom } from '../src/rooms/manager.js'

interface TestClient extends RoomClient {
  readonly inbox: ServerMessage[]
}

function player(name: string, kind: PlayerKind = 'user'): TestClient {
  const inbox: ServerMessage[] = []
  return { identity: { id: `id-${name}`, name, kind }, inbox, send: (m) => inbox.push(m) }
}

function last(client: TestClient): ServerMessage | undefined {
  return client.inbox.at(-1)
}

function lastRoom(client: TestClient): RoomView {
  const message = [...client.inbox].reverse().find((m) => m.type === 'room.state')
  if (message?.type !== 'room.state') throw new Error(`${client.identity.name} has no room state`)
  return message.room
}

function lastError(client: TestClient): string | undefined {
  const message = last(client)
  return message?.type === 'error' ? message.code : undefined
}

const DECK = 'RB1|legend|champion|3xA|12xR|B1,B2,B3'

let clock: number
let started: StartingRoom[]
let manager: RoomManager

function build(options: Partial<RoomManagerOptions> = {}): void {
  manager = new RoomManager({
    checkDeck: (deck) => (deck.startsWith('bad') ? 'Not a deck.' : null),
    now: () => clock,
    onStart: (room) => started.push(room),
    ...options,
  })
}

beforeEach(() => {
  clock = 1_000_000
  started = []
  build()
})

/** Host creates, friend joins; returns both and the code. */
function pair() {
  const host = player('Host')
  const friend = player('Friend')
  manager.handle(host, { type: 'room.create', deck: DECK })
  const code = lastRoom(host).code
  manager.handle(friend, { type: 'room.join', code, deck: DECK })
  return { host, friend, code }
}

describe('room codes', () => {
  it('are six characters from the unambiguous alphabet', () => {
    for (let i = 0; i < 200; i += 1) {
      const code = generateRoomCode()
      expect(code).toHaveLength(ROOM_CODE_LENGTH)
      for (const char of code) expect(ROOM_CODE_ALPHABET).toContain(char)
    }
    expect(ROOM_CODE_ALPHABET).not.toMatch(/[IO01]/)
  })

  it('never hands out a code that is already in use', () => {
    const codes = ['AAAAAA', 'AAAAAA', 'AAAAAA', 'BBBBBB']
    build({ generateCode: () => codes.shift() ?? 'CCCCCC' })
    const a = player('A')
    const b = player('B')
    manager.handle(a, { type: 'room.create', deck: DECK })
    manager.handle(b, { type: 'room.create', deck: DECK })
    expect(lastRoom(a).code).toBe('AAAAAA')
    expect(lastRoom(b).code).toBe('BBBBBB')
  })
})

describe('creating a room', () => {
  it('seats the host alone, waiting', () => {
    const host = player('Host')
    manager.handle(host, { type: 'room.create', deck: DECK })
    const room = lastRoom(host)
    expect(room.status).toBe('waiting')
    expect(room.yourSeat).toBe(0)
    expect(room.seats).toEqual([
      { name: 'Host', kind: 'user', host: true, ready: false, hasDeck: true },
    ])
    expect(manager.size).toBe(1)
  })

  it('is not open to guests', () => {
    const guest = player('Guest000001', 'guest')
    manager.handle(guest, { type: 'room.create', deck: DECK })
    expect(lastError(guest)).toBe('guests-cannot-host')
    expect(manager.size).toBe(0)
  })

  it('needs a deck that passes the check', () => {
    const host = player('Host')
    manager.handle(host, { type: 'room.create', deck: 'bad deck' })
    expect(lastError(host)).toBe('bad-deck')
    expect(manager.size).toBe(0)
  })

  it('refuses a second room while the player is in one', () => {
    const host = player('Host')
    manager.handle(host, { type: 'room.create', deck: DECK })
    manager.handle(host, { type: 'room.create', deck: DECK })
    expect(lastError(host)).toBe('already-in-room')
    expect(manager.size).toBe(1)
  })
})

describe('joining a room', () => {
  it('seats the friend and shows both players the full room', () => {
    const { host, friend } = pair()
    expect(lastRoom(host).status).toBe('full')
    expect(lastRoom(friend).yourSeat).toBe(1)
    expect(lastRoom(host).seats.map((s) => s.name)).toEqual(['Host', 'Friend'])
  })

  it('accepts the code however it was typed', () => {
    const host = player('Host')
    manager.handle(host, { type: 'room.create', deck: DECK })
    const code = lastRoom(host).code
    const friend = player('Friend')
    const typed = ` ${code.slice(0, 3).toLowerCase()}-${code.slice(3)} `
    manager.handle(friend, { type: 'room.join', code: typed, deck: DECK })
    expect(lastRoom(friend).code).toBe(code)
  })

  it('lets guests join', () => {
    const host = player('Host')
    manager.handle(host, { type: 'room.create', deck: DECK })
    const guest = player('Guest000001', 'guest')
    manager.handle(guest, { type: 'room.join', code: lastRoom(host).code, deck: DECK })
    expect(lastRoom(host).seats[1]).toMatchObject({ name: 'Guest000001', kind: 'guest' })
  })

  it('never shows either player the other deck', () => {
    const host = player('Host')
    manager.handle(host, { type: 'room.create', deck: 'RB1|secret-host-legend|c|||' })
    const friend = player('Friend')
    manager.handle(friend, {
      type: 'room.join',
      code: lastRoom(host).code,
      deck: 'RB1|secret-friend-legend|c|||',
    })
    expect(JSON.stringify(host.inbox)).not.toContain('secret-friend-legend')
    expect(JSON.stringify(friend.inbox)).not.toContain('secret-host-legend')
  })

  it('reports an unknown code', () => {
    const friend = player('Friend')
    manager.handle(friend, { type: 'room.join', code: 'ZZZZZZ', deck: DECK })
    expect(lastError(friend)).toBe('room-not-found')
  })

  it('refuses a third player', () => {
    const { code } = pair()
    const third = player('Third')
    manager.handle(third, { type: 'room.join', code, deck: DECK })
    expect(lastError(third)).toBe('room-full')
  })

  it('refuses a bad deck without taking the seat', () => {
    const host = player('Host')
    manager.handle(host, { type: 'room.create', deck: DECK })
    const friend = player('Friend')
    manager.handle(friend, { type: 'room.join', code: lastRoom(host).code, deck: 'bad' })
    expect(lastError(friend)).toBe('bad-deck')
    expect(lastRoom(host).seats).toHaveLength(1)
  })

  it('slows down someone guessing codes, then lets them try again later', () => {
    build({ joinAttempts: { max: 3, windowMs: 60_000 } })
    const host = player('Host')
    manager.handle(host, { type: 'room.create', deck: DECK })
    const code = lastRoom(host).code
    const guesser = player('Guesser')

    for (let i = 0; i < 3; i += 1) {
      manager.handle(guesser, { type: 'room.join', code: 'WRONG1', deck: DECK })
      expect(lastError(guesser)).toBe('room-not-found')
    }
    // Even the right code is refused while the limit holds.
    manager.handle(guesser, { type: 'room.join', code, deck: DECK })
    expect(lastError(guesser)).toBe('too-many-attempts')

    clock += 60_001
    manager.handle(guesser, { type: 'room.join', code, deck: DECK })
    expect(lastRoom(guesser).code).toBe(code)
  })
})

describe('readying up', () => {
  it('starts only when both players are ready, and hands over both decks', () => {
    const { host, friend, code } = pair()
    manager.handle(host, { type: 'room.ready', ready: true })
    expect(lastRoom(friend).seats[0]?.ready).toBe(true)
    expect(lastRoom(friend).status).toBe('full')
    expect(started).toHaveLength(0)

    manager.handle(friend, { type: 'room.ready', ready: true })
    expect(lastRoom(host).status).toBe('starting')
    expect(started).toEqual([
      {
        code,
        players: [
          { identity: host.identity, deck: DECK },
          { identity: friend.identity, deck: DECK },
        ],
      },
    ])
  })

  it('cannot start alone', () => {
    const host = player('Host')
    manager.handle(host, { type: 'room.create', deck: DECK })
    manager.handle(host, { type: 'room.ready', ready: true })
    expect(lastRoom(host).status).toBe('waiting')
    expect(started).toHaveLength(0)
  })

  it('un-readies a player who switches deck', () => {
    const { host } = pair()
    manager.handle(host, { type: 'room.ready', ready: true })
    manager.handle(host, { type: 'room.deck', deck: 'RB1|other|c|||' })
    expect(lastRoom(host).seats[0]?.ready).toBe(false)
  })

  it('locks the room once starting, except for leaving', () => {
    const { host, friend } = pair()
    manager.handle(host, { type: 'room.ready', ready: true })
    manager.handle(friend, { type: 'room.ready', ready: true })

    manager.handle(host, { type: 'room.ready', ready: false })
    expect(lastError(host)).toBe('room-locked')
    manager.handle(friend, { type: 'room.deck', deck: DECK })
    expect(lastError(friend)).toBe('room-locked')

    manager.handle(friend, { type: 'room.leave' })
    expect(last(friend)).toEqual({ type: 'room.closed', reason: 'left' })
    expect(lastRoom(host).status).toBe('waiting')
  })

  it('requires being in a room', () => {
    const lost = player('Lost')
    manager.handle(lost, { type: 'room.ready', ready: true })
    expect(lastError(lost)).toBe('not-in-room')
    manager.handle(lost, { type: 'room.leave' })
    expect(lastError(lost)).toBe('not-in-room')
  })
})

describe('leaving', () => {
  it('when the friend leaves, the host keeps the room', () => {
    const { host, friend, code } = pair()
    manager.handle(friend, { type: 'room.leave' })
    expect(last(friend)).toEqual({ type: 'room.closed', reason: 'left' })
    expect(lastRoom(host)).toMatchObject({ code, status: 'waiting' })
    expect(lastRoom(host).seats).toHaveLength(1)

    // The seat is free for someone else.
    const other = player('Other')
    manager.handle(other, { type: 'room.join', code, deck: DECK })
    expect(lastRoom(other).yourSeat).toBe(1)
  })

  it('when the host leaves, the room closes for everyone and the code dies', () => {
    const { host, friend, code } = pair()
    manager.handle(host, { type: 'room.leave' })
    expect(last(host)).toEqual({ type: 'room.closed', reason: 'left' })
    expect(last(friend)).toEqual({ type: 'room.closed', reason: 'host-left' })
    expect(manager.size).toBe(0)

    // Both are free to go elsewhere.
    manager.handle(friend, { type: 'room.create', deck: DECK })
    expect(lastRoom(friend).status).toBe('waiting')
    const late = player('Late')
    manager.handle(late, { type: 'room.join', code, deck: DECK })
    expect(lastError(late)).toBe('room-not-found')
  })

  it('happens on disconnect, without a message to the socket that is gone', () => {
    const { host, friend } = pair()
    const before = friend.inbox.length
    manager.disconnect(friend)
    expect(friend.inbox).toHaveLength(before)
    expect(lastRoom(host).seats).toHaveLength(1)
  })

  it('does not happen when a reconnected player’s old socket closes late', () => {
    const { host, friend } = pair()
    const reconnected: TestClient = { ...player('Friend'), identity: friend.identity }
    manager.replace(friend, reconnected)
    expect(lastRoom(reconnected).yourSeat).toBe(1)

    manager.disconnect(friend) // the old socket finally closes
    expect(lastRoom(host).seats).toHaveLength(2)

    // And the new connection is the one the room now talks to.
    manager.handle(host, { type: 'room.ready', ready: true })
    expect(lastRoom(reconnected).seats[0]?.ready).toBe(true)
  })
})

describe('the server deck check', () => {
  it('accepts anything that decodes as a deck code', () => {
    expect(checkDeckCode(DECK)).toBeNull()
  })

  it('explains a code from another version, and plain junk', () => {
    expect(checkDeckCode('RB9|a|b|||')).toMatch(/different version/)
    expect(checkDeckCode('hello')).toMatch(/not a deck code/)
  })
})
