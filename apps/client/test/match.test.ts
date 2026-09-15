import { describe, expect, it } from 'vitest'

import type { GameAction, GameView } from '@rb/engine'
import type { ServerMessage } from '@rb/protocol'

import {
  abilitiesOf,
  canPass,
  canPlay,
  playsOf,
  movesOf,
  reduceMatch,
  waitingOnOpponent,
} from '../src/shared/match.js'
import type { MatchSession } from '../src/shared/match.js'

const players = [
  { name: 'Host', kind: 'user' },
  { name: 'Friend', kind: 'guest' },
] as const

const started: ServerMessage = { type: 'match.started', matchId: 'm1', seat: 1, players }

const view = (turnNumber: number) => ({ viewer: 1, turnNumber }) as unknown as GameView

const state = (seq: number, legal: GameAction[] = [], turnNumber = seq): ServerMessage => ({
  type: 'match.state',
  matchId: 'm1',
  seq,
  view: view(turnNumber),
  legal,
})

function run(...messages: ServerMessage[]): MatchSession | null {
  return messages.reduce<MatchSession | null>((session, m) => reduceMatch(session, m), null)
}

describe('following a match from server messages', () => {
  it('starts empty and fills in with state', () => {
    const session = run(started)
    expect(session).toMatchObject({ id: 'm1', seat: 1, view: null, ended: null })
    expect(run(started, state(0))?.view?.turnNumber).toBe(0)
  })

  it('ignores an update older than the one it has', () => {
    const session = run(started, state(5), state(4))
    expect(session?.seq).toBe(5)
    expect(session?.view?.turnNumber).toBe(5)
  })

  it('ignores messages for another match', () => {
    const other: ServerMessage = { ...state(9), matchId: 'm2' } as ServerMessage
    expect(run(started, state(1), other)?.seq).toBe(1)
  })

  it('keeps the board through a reconnect until fresh state arrives', () => {
    const session = run(started, state(3), started)
    expect(session?.view?.turnNumber).toBe(3)
  })

  it('starts clean for a new match after one has ended', () => {
    const ended: ServerMessage = {
      type: 'match.ended',
      matchId: 'm1',
      winner: 0,
      reason: 'concede',
    }
    const session = run(started, state(3), ended, started)
    expect(session?.ended).toBeNull()
    expect(session?.view).toBeNull()
  })

  it('records the end and drops every legal action', () => {
    const session = run(started, state(2, [{ type: 'pass', player: 1 }]), {
      type: 'match.ended',
      matchId: 'm1',
      winner: 1,
      reason: 'victory',
    })
    expect(session?.ended).toEqual({ winner: 1, reason: 'victory' })
    expect(session?.legal).toEqual([])
  })

  it('tracks the opponent being away, and coming back', () => {
    const away = run(started, { type: 'match.opponent-away', matchId: 'm1', forfeitAt: 123 })
    expect(away?.opponentAwayUntil).toBe(123)
    const back = reduceMatch(away, { type: 'match.opponent-away', matchId: 'm1', forfeitAt: null })
    expect(back?.opponentAwayUntil).toBeNull()
  })
})

describe('reading legal actions', () => {
  const legal: GameAction[] = [
    { type: 'concede', player: 1 },
    { type: 'pass', player: 1 },
    { type: 'play-card', player: 1, card: 'o5' },
    { type: 'play-card', player: 1, card: 'o5', to: { kind: 'battlefield', id: 'o1' } },
    { type: 'activate-ability', player: 1, source: 'o9', abilityId: 'fury-rune-energy' },
    { type: 'move', player: 1, units: ['o7'], to: { kind: 'battlefield', id: 'o1' } },
    { type: 'move', player: 1, units: ['o7'], to: { kind: 'base', player: 1 } },
  ]

  it('answers what the player may do with each object', () => {
    expect(canPlay(legal, 'o5')).toBe(true)
    expect(canPlay(legal, 'o6')).toBe(false)
    // One play per place a unit may enter, the plain play first (355.2).
    expect(playsOf(legal, 'o5').map((play) => play.to)).toEqual([
      undefined,
      { kind: 'battlefield', id: 'o1' },
    ])
    expect(abilitiesOf(legal, 'o9')).toEqual(['fury-rune-energy'])
    expect(movesOf(legal, 'o7')).toHaveLength(2)
    expect(canPass(legal)).toBe(true)
  })

  it('knows when it is only waiting on the opponent', () => {
    const waiting = run(started, state(1, [{ type: 'concede', player: 1 }]))
    const acting = run(started, state(1, legal))
    expect(waiting && waitingOnOpponent(waiting)).toBe(true)
    expect(acting && waitingOnOpponent(acting)).toBe(false)
  })
})
