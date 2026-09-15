import { beforeEach, describe, expect, it } from 'vitest'

import { PROVING_GROUNDS_DECKS } from '@rb/cards'
import { SeededRng, encodeDeck } from '@rb/engine'
import type { GameAction } from '@rb/engine'
import type { MatchServerMessage, PlayerKind, ServerMessage } from '@rb/protocol'

import { MatchManager } from '../src/matches/manager.js'
import type { MatchSummary, Timer } from '../src/matches/manager.js'
import type { RoomClient } from '../src/rooms/manager.js'

interface TestClient extends RoomClient {
  readonly inbox: ServerMessage[]
}

function player(name: string, kind: PlayerKind = 'user'): TestClient {
  const inbox: ServerMessage[] = []
  return { identity: { id: `id-${name}`, name, kind }, inbox, send: (m) => inbox.push(m) }
}

type Of<T extends ServerMessage['type']> = Extract<ServerMessage, { type: T }>

function lastOf<T extends ServerMessage['type']>(client: TestClient, type: T): Of<T> {
  const found = [...client.inbox].reverse().find((m) => m.type === type)
  if (!found) throw new Error(`${client.identity.name} has no ${type}`)
  return found as Of<T>
}

const annie = encodeDeck(PROVING_GROUNDS_DECKS[0]?.deck ?? fail())
const lux = encodeDeck(PROVING_GROUNDS_DECKS[1]?.deck ?? fail())

function fail(): never {
  throw new Error('missing starter deck')
}

let timers: { callback: () => void; ms: number; cancelled: boolean }[]
let ended: MatchSummary[]
let clock: number
let manager: MatchManager

const setTimer: Timer = (callback, ms) => {
  const timer = { callback, ms, cancelled: false }
  timers.push(timer)
  return () => {
    timer.cancelled = true
  }
}

beforeEach(() => {
  timers = []
  ended = []
  clock = 1_000_000
  manager = new MatchManager({
    seed: () => 7,
    generateId: () => 'match-1',
    now: () => clock,
    setTimer,
    forfeitAfterMs: 60_000,
    onEnd: (summary) => ended.push(summary),
  })
})

function begin() {
  const host = player('Host')
  const friend = player('Friend', 'guest')
  manager.start({
    code: 'ABCDEF',
    players: [
      { identity: host.identity, deck: annie, client: host },
      { identity: friend.identity, deck: lux, client: friend },
    ],
  })
  return { host, friend, clients: [host, friend] as const }
}

/** Whoever the engine is waiting on, and that client. */
function actor(clients: readonly [TestClient, TestClient]) {
  for (const seat of [0, 1] as const) {
    const client = clients[seat]
    const legal = lastOf(client, 'match.state').legal.filter((a) => a.type !== 'concede')
    if (legal.length > 0) return { seat, client, legal }
  }
  throw new Error('nobody can act')
}

function act(client: TestClient, action: GameAction) {
  manager.handle(client, { type: 'match.action', matchId: 'match-1', action })
}

describe('starting a match', () => {
  it('tells each player their seat and who they are playing', () => {
    const { host, friend } = begin()
    expect(lastOf(host, 'match.started')).toEqual({
      type: 'match.started',
      matchId: 'match-1',
      seat: 0,
      players: [
        { name: 'Host', kind: 'user' },
        { name: 'Friend', kind: 'guest' },
      ],
    })
    expect(lastOf(friend, 'match.started').seat).toBe(1)
    expect(manager.isPlaying('id-Host')).toBe(true)
    expect(manager.size).toBe(1)
  })

  it('sends each player a view from their own seat', () => {
    const { host, friend } = begin()
    expect(lastOf(host, 'match.state').view.viewer).toBe(0)
    expect(lastOf(friend, 'match.state').view.viewer).toBe(1)
  })

  it('never sends a player the cards in the other hand', () => {
    const { host, friend } = begin()
    const friendHand = lastOf(friend, 'match.state').view.players[1].hand.cards ?? []
    expect(friendHand.length).toBeGreaterThan(0)

    const hostView = lastOf(host, 'match.state').view
    expect(hostView.players[1].hand.cards).toBeUndefined()
    expect(hostView.players[1].hand.count).toBe(friendHand.length)
    // Absent, not masked: not one of those object ids appears anywhere in
    // anything the host was sent.
    const everythingSentToHost = JSON.stringify(host.inbox)
    for (const id of friendHand) expect(everythingSentToHost).not.toContain(`"${id}"`)
  })
})

describe('taking actions', () => {
  it('applies a legal action and updates both players', () => {
    const { clients } = begin()
    const { client, legal } = actor(clients)
    const before = lastOf(clients[0], 'match.state').seq
    act(client, legal[0] as GameAction)
    expect(lastOf(clients[0], 'match.state').seq).toBe(before + 1)
    expect(lastOf(clients[1], 'match.state').seq).toBe(before + 1)
  })

  it('acts as the connection’s own seat, whatever the action claims', () => {
    const { clients } = begin()
    const { seat, legal } = actor(clients)
    const waiting = clients[seat === 0 ? 1 : 0]
    const before = lastOf(waiting, 'match.state').seq

    // The waiting player sends the acting player's own legal move, naming them.
    act(waiting, legal[0] as GameAction)

    expect(lastOf(waiting, 'match.state').seq).toBe(before)
    expect(lastOf(waiting, 'error').code).toBe('illegal-action')
  })

  it('rejects an action for a match the player is not in', () => {
    const { host } = begin()
    manager.handle(host, {
      type: 'match.action',
      matchId: 'some-other-match',
      action: { type: 'pass', player: 0 },
    })
    expect(lastOf(host, 'error').code).toBe('not-in-match')
  })

  it('plays a whole game to a winner through the real engine', () => {
    const { clients } = begin()
    const rng = SeededRng.fromSeed(3)
    for (let i = 0; i < 6000 && manager.size > 0; i += 1) {
      const { client, legal, seat } = actor(clients)
      let action = legal[rng.nextInt(legal.length)] as GameAction
      const view = lastOf(client, 'match.state').view
      if (action.type === 'resolve-choice') {
        const choice = view.pendingChoice
        action = { ...action, chosen: (choice?.candidates ?? []).slice(0, choice?.min ?? 0) }
      }
      if (action.type === 'mulligan') action = { ...action, setAside: [] }
      act(client, action)
      expect(client.inbox.at(-1)?.type, `step ${String(i)} seat ${String(seat)}`).not.toBe('error')
    }
    expect(manager.size).toBe(0)
    const end = lastOf(clients[0], 'match.ended')
    expect(end.reason).toBe('victory')
    expect(end.winner === 0 || end.winner === 1).toBe(true)
    expect(ended[0]).toMatchObject({ id: 'match-1', reason: 'victory', seed: 7 })
    // A real game, not a shortcut: many actions over many turns.
    expect(ended[0]?.actions).toBeGreaterThan(50)
    expect(lastOf(clients[0], 'match.state').view.turnNumber).toBeGreaterThan(3)
  })
})

describe('ending', () => {
  it('ends on concede, for both players, and frees them', () => {
    const { host, friend } = begin()
    act(friend, { type: 'concede', player: 1 })
    const expected: MatchServerMessage = {
      type: 'match.ended',
      matchId: 'match-1',
      winner: 0,
      reason: 'concede',
    }
    expect(lastOf(host, 'match.ended')).toEqual(expected)
    expect(lastOf(friend, 'match.ended')).toEqual(expected)
    expect(manager.isPlaying('id-Host')).toBe(false)
    expect(manager.isPlaying('id-Friend')).toBe(false)
    expect(ended).toHaveLength(1)
  })
})

describe('disconnecting', () => {
  it('warns the opponent, and forfeits if the player does not return in time', () => {
    const { host, friend } = begin()
    manager.disconnect(friend)
    expect(lastOf(host, 'match.opponent-away').forfeitAt).toBe(clock + 60_000)

    const pending = timers.find((t) => !t.cancelled && t.ms === 60_000)
    pending?.callback()
    expect(lastOf(host, 'match.ended')).toMatchObject({ winner: 0, reason: 'abandoned' })
    expect(manager.size).toBe(0)
  })

  it('puts a returning player straight back into the game, and cancels the forfeit', () => {
    const { host, friend } = begin()
    const seqBefore = lastOf(friend, 'match.state').seq
    manager.disconnect(friend)

    const back = player('Friend', 'guest')
    manager.attach(back)
    expect(lastOf(back, 'match.started').seat).toBe(1)
    expect(lastOf(back, 'match.state').seq).toBe(seqBefore)
    expect(lastOf(host, 'match.opponent-away').forfeitAt).toBeNull()
    expect(timers.every((t) => t.cancelled)).toBe(true)
    expect(manager.size).toBe(1)
  })

  it('ignores the old socket closing after the player has already reconnected', () => {
    const { friend } = begin()
    const back = player('Friend', 'guest')
    manager.attach(back)
    manager.disconnect(friend) // the replaced connection finally closes
    expect(timers.filter((t) => !t.cancelled)).toHaveLength(0)
  })

  it('does nothing for a player who is not in a match', () => {
    const stranger = player('Stranger')
    manager.attach(stranger)
    manager.disconnect(stranger)
    expect(stranger.inbox).toHaveLength(0)
  })
})
