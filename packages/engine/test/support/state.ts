/**
 * Test fixtures for building a GameState directly.
 *
 * Real setup (110-118) is not implemented yet — the mulligan and setup order are
 * still open questions in rules-spec §14 — so tests construct the state they
 * need explicitly rather than playing a game to reach it. That also keeps each
 * test's preconditions visible in the test itself.
 */

import { EMPTY_POOL } from '../../src/model/cost.js'
import { SeededRng } from '../../src/rng.js'
import type {
  BattlefieldState,
  GameObject,
  GameState,
  ObjectId,
  PlayerId,
  PlayerState,
  ZoneName,
} from '../../src/state/game-state.js'

export interface ObjectSpec {
  readonly id: ObjectId
  readonly cardId?: string
  readonly owner: PlayerId
  readonly controller?: PlayerId
  readonly zone: ZoneName
  readonly faceDown?: boolean
  readonly exhausted?: boolean
  readonly damage?: number
  readonly buffs?: number
}

function emptyPlayer(id: PlayerId): PlayerState {
  return {
    id,
    points: 0,
    hand: [],
    mainDeck: [],
    runeDeck: [],
    trash: [],
    banishment: [],
    championZone: [],
    legendZone: [],
    base: [],
    runePool: EMPTY_POOL,
    scoredThisTurn: [],
  }
}

/** Zones that live on a PlayerState and hold an ordered list of ids. */
const PLAYER_ZONES = [
  'hand',
  'mainDeck',
  'runeDeck',
  'trash',
  'banishment',
  'championZone',
  'legendZone',
  'base',
] as const

type PlayerZone = (typeof PLAYER_ZONES)[number]

function isPlayerZone(zone: ZoneName): zone is PlayerZone {
  return (PLAYER_ZONES as readonly string[]).includes(zone)
}

export function makeState(
  specs: readonly ObjectSpec[],
  overrides: Partial<GameState> = {},
): GameState {
  const objects: Record<ObjectId, GameObject> = {}
  const players: Record<PlayerId, PlayerState> = { 0: emptyPlayer(0), 1: emptyPlayer(1) }

  for (const spec of specs) {
    const controller = spec.controller ?? spec.owner
    objects[spec.id] = {
      id: spec.id,
      cardId: spec.cardId ?? 'OGS-003',
      owner: spec.owner,
      controller,
      zone: spec.zone,
      exhausted: spec.exhausted ?? false,
      damage: spec.damage ?? 0,
      buffs: spec.buffs ?? 0,
      faceDown: spec.faceDown ?? false,
    }
    if (isPlayerZone(spec.zone)) {
      const owner = players[spec.owner]
      players[spec.owner] = { ...owner, [spec.zone]: [...owner[spec.zone], spec.id] }
    }
  }

  const battlefields: readonly BattlefieldState[] = [
    { id: 'bf-0', contested: false, facedown: [] },
    { id: 'bf-1', contested: false, facedown: [] },
  ]

  return {
    rng: SeededRng.fromSeed(1).state,
    objects,
    players,
    battlefields,
    turnPlayer: 0,
    turnNumber: 1,
    phase: 'main',
    step: 'main',
    stepTaskDone: true,
    chain: [],
    priority: 0,
    focus: null,
    pendingChoice: null,
    resolving: null,
    consecutivePasses: 0,
    winner: null,
    nextObjectId: specs.length + 1,
    ...overrides,
  }
}
