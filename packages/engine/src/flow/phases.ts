/**
 * The turn machine — phases, steps, and the tasks each one performs.
 *
 * Transcribed from rules-spec §7, which comes from 314-318. The order is
 * declarative rather than a chain of `if`s so it can be checked against the
 * rulebook line by line, and corrected in one place when it turns out to be
 * wrong.
 *
 * Only the Main Phase grants Priority (316.5, 335). Every other step performs
 * its task and moves on, which is why a turn can advance a long way without any
 * player input.
 */

import type { GameEvent } from '../effects/events.js'
import { emptyPool } from '../model/cost.js'
import { SeededRng } from '../rng.js'
import type {
  GameState,
  ObjectId,
  Phase,
  PlayerId,
  PlayerState,
  Step,
} from '../state/game-state.js'
import { opponentOf } from '../state/game-state.js'

/** Victory Score for 1v1 Duel (485.3). */
export const VICTORY_SCORE = 8

/** Runes channeled during the Channel Phase (315.3.b). */
export const RUNES_PER_TURN = 2

interface StepDef {
  readonly phase: Phase
  readonly step: Step
  /** Only the Main Phase is an open window for discretionary actions (316.5). */
  readonly grantsPriority?: boolean
}

/**
 * Every step of a turn, in order (315-317).
 *
 * Start of Turn is four phases, not one: Awaken, Beginning (which contains the
 * Scoring Step), Channel, then Draw. Scoring happening *here* rather than at end
 * of turn is easy to get wrong.
 */
export const TURN_STEPS: readonly StepDef[] = [
  { phase: 'awaken', step: 'ready' }, // 315.1
  { phase: 'beginning', step: 'beginning' }, // 315.2.a
  { phase: 'beginning', step: 'scoring' }, // 315.2.b
  { phase: 'channel', step: 'channel' }, // 315.3
  { phase: 'draw', step: 'draw' }, // 315.4
  { phase: 'main', step: 'main', grantsPriority: true }, // 316
  { phase: 'ending', step: 'ending' }, // 317.1
  { phase: 'ending', step: 'expiration' }, // 317.2
]

function stepIndex(phase: Phase, step: Step): number {
  return TURN_STEPS.findIndex((s) => s.phase === phase && s.step === step)
}

function withPlayer(state: GameState, id: PlayerId, patch: Partial<PlayerState>): GameState {
  return { ...state, players: { ...state.players, [id]: { ...state.players[id], ...patch } } }
}

// ---------------------------------------------------------------------------
// Step tasks
// ---------------------------------------------------------------------------

/** 315.1.b — the Turn Player readies everything they control that can be readied. */
function awaken(state: GameState, events: GameEvent[]): GameState {
  const objects = { ...state.objects }
  for (const [id, object] of Object.entries(state.objects)) {
    const onBoard = object.zone === 'base' || object.zone === 'battlefield'
    if (onBoard && object.controller === state.turnPlayer && object.exhausted) {
      objects[id] = { ...object, exhausted: false }
      events.push({ type: 'readied', target: id })
    }
  }
  return { ...state, objects }
}

/**
 * Score a Battlefield, respecting the Final Point rule (471.1.b).
 *
 * A player may Score each Battlefield at most once per turn (470). The Final
 * Point restriction applies **only to Conquer** — points from a Hold or from any
 * other source are not subject to it (471.1.a.1).
 */
export function score(
  state: GameState,
  player: PlayerId,
  battlefieldId: ObjectId,
  method: 'conquer' | 'hold',
  events: GameEvent[],
): GameState {
  const p = state.players[player]
  if (p.scoredThisTurn.includes(battlefieldId)) return state // 470

  const scoredThisTurn = [...p.scoredThisTurn, battlefieldId]

  // 471.1.b - a Conquer that would reach the Victory Score only scores if the
  // player has Scored every Battlefield this turn; otherwise they draw instead.
  if (method === 'conquer' && p.points >= VICTORY_SCORE - 1) {
    const everyBattlefield = state.battlefields.every((b) => scoredThisTurn.includes(b.id))
    if (!everyBattlefield) {
      // The draw itself is handled by the caller's effect pipeline; recording
      // the Score without the point is what matters here.
      return withPlayer(state, player, { scoredThisTurn })
    }
  }

  events.push({ type: 'points-gained', player, amount: 1 })
  return withPlayer(state, player, { points: p.points + 1, scoredThisTurn })
}

/** 315.2.b.2 — the Turn Player Holds all Battlefields they Control. */
function scoringStep(state: GameState, events: GameEvent[]): GameState {
  let next = state
  for (const bf of state.battlefields) {
    if (bf.controller === state.turnPlayer) {
      next = score(next, state.turnPlayer, bf.id, 'hold', events)
    }
  }
  return next
}

/**
 * 430 — take runes off the top of the Rune Deck and put them on the board,
 * readied by default (430.2.a). Fewer than asked for if the deck is short
 * (430.3); running out does **not** cause a Burn Out, which applies to the Main
 * Deck (431.1).
 */
export function channel(
  state: GameState,
  player: PlayerId,
  count: number,
  events: GameEvent[],
): GameState {
  const p = state.players[player]
  const taken = p.runeDeck.slice(0, count)
  if (taken.length === 0) return state

  const objects = { ...state.objects }
  for (const id of taken) {
    const object = objects[id]
    if (object) {
      objects[id] = {
        ...object,
        zone: 'base',
        location: { kind: 'base', player },
        exhausted: false,
      }
    }
  }
  events.push({ type: 'channeled', player, runes: taken })
  return withPlayer({ ...state, objects }, player, {
    runeDeck: p.runeDeck.slice(taken.length),
    base: [...p.base, ...taken],
  })
}

/**
 * 317.2 — the Expiration Step.
 *
 * Heals all units, expires "this turn" effects, and empties both Rune Pools
 * (317.2.b-e). Damage is healed at end of turn and in a Combat Cleanup only
 * (143.3.b).
 */
function expiration(state: GameState, events: GameEvent[]): GameState {
  const objects = { ...state.objects }
  for (const [id, object] of Object.entries(state.objects)) {
    const onBoard = object.zone === 'base' || object.zone === 'battlefield'
    if (onBoard && object.damage > 0) {
      objects[id] = { ...object, damage: 0 }
      events.push({ type: 'healed', target: id })
    }
  }
  let next: GameState = { ...state, objects }
  for (const player of [0, 1] as const) {
    next = withPlayer(next, player, { runePool: emptyPool() })
  }
  return next
}

/** 472 — on a Cleanup, a player at or past the Victory Score with more points wins. */
export function checkWin(state: GameState, events: GameEvent[]): GameState {
  if (state.winner !== null) return state
  for (const player of [0, 1] as const) {
    const mine = state.players[player].points
    const theirs = state.players[opponentOf(player)].points
    if (mine >= VICTORY_SCORE && mine > theirs) {
      events.push({ type: 'game-won', player })
      return { ...state, winner: player, priority: null, focus: null }
    }
  }
  return state
}

// ---------------------------------------------------------------------------
// Advancing
// ---------------------------------------------------------------------------

/**
 * 317.3 — the next player with their turn queued becomes the Turn Player.
 *
 * `scoredThisTurn` is cleared for *both* players: it tracks Scoring within a
 * turn (470) and must not leak into the next one.
 */
function beginTurn(state: GameState): GameState {
  const cleared = withPlayer(withPlayer(state, 0, { scoredThisTurn: [] }), 1, {
    scoredThisTurn: [],
  })
  return {
    ...cleared,
    turnPlayer: opponentOf(state.turnPlayer),
    turnNumber: state.turnNumber + 1,
    phase: 'awaken',
    step: 'ready',
    stepTaskDone: false,
    priority: null,
    focus: null,
  }
}

/** Run the task attached to the state's current step. */
function runStepTask(state: GameState, events: GameEvent[]): GameState {
  switch (state.step) {
    case 'ready':
      return awaken(state, events)
    case 'scoring':
      return scoringStep(state, events)
    case 'channel': {
      // 485.7 - the player going second channels an extra rune during their
      // first Channel Phase of the game.
      const secondPlayerFirstTurn = state.turnPlayer === 1 && state.turnNumber <= 2
      return channel(
        state,
        state.turnPlayer,
        RUNES_PER_TURN + (secondPlayerFirstTurn ? 1 : 0),
        events,
      )
    }
    case 'draw':
      return drawForTurn(state, events)
    case 'main':
      // 316.3 - each player's Rune Pool empties at the start of the Main Phase.
      return withPlayer(withPlayer(state, 0, { runePool: emptyPool() }), 1, {
        runePool: emptyPool(),
      })
    case 'expiration':
      return expiration(state, events)
    case 'beginning':
    case 'ending':
      // Windows for start/end-of-phase effects. Nothing to do until triggered
      // abilities land.
      return state
  }
}

/**
 * 315.4.b — the Turn Player draws 1.
 *
 * Kept here rather than reusing the interpreter's `draw` step because a turn
 * draw is a game task, not a card effect; it must happen even with no ability
 * on the chain.
 */
function drawForTurn(state: GameState, events: GameEvent[]): GameState {
  const player = state.turnPlayer
  const p = state.players[player]

  if (p.mainDeck.length === 0) {
    // 431.1.a - burn out, then still draw (315.4.b.2).
    let next = burnOutFor(state, player, events)
    if (next.players[player].mainDeck.length === 0) return next
    next = drawOne(next, player, events)
    return next
  }
  return drawOne(state, player, events)
}

function drawOne(state: GameState, player: PlayerId, events: GameEvent[]): GameState {
  const p = state.players[player]
  const [top, ...rest] = p.mainDeck
  if (!top) return state
  const object = state.objects[top]
  const objects = object
    ? { ...state.objects, [top]: { ...object, zone: 'hand' as const } }
    : state.objects
  events.push({ type: 'drew', player, cards: [top] })
  return withPlayer({ ...state, objects }, player, { mainDeck: rest, hand: [...p.hand, top] })
}

/** 431.2 — recycle the trash into the deck, shuffle, give an opponent a point. */
function burnOutFor(state: GameState, player: PlayerId, events: GameEvent[]): GameState {
  const p = state.players[player]
  const objects = { ...state.objects }
  for (const id of p.trash) {
    const object = objects[id]
    if (object) objects[id] = { ...object, zone: 'mainDeck' }
  }

  const rng = SeededRng.fromState(state.rng)
  const deck = rng.shuffle([...p.mainDeck, ...p.trash])

  let next = withPlayer({ ...state, objects, rng: rng.state }, player, {
    mainDeck: deck,
    trash: [],
  })

  const beneficiary = opponentOf(player)
  next = withPlayer(next, beneficiary, { points: next.players[beneficiary].points + 1 })
  events.push({ type: 'burned-out', player, gavePointTo: beneficiary })
  events.push({ type: 'points-gained', player: beneficiary, amount: 1 })
  return next
}

export interface AdvanceResult {
  readonly state: GameState
  readonly events: readonly GameEvent[]
}

/**
 * Advance through steps until someone gets Priority or the game ends.
 *
 * This is the "Handle Outstanding Tasks" half of HOT FEPR (334): tasks run to
 * completion, and only then does anyone get to act. A step that grants Priority
 * stops the loop; everything else runs its task and moves on.
 */
export function advanceFlow(state: GameState): AdvanceResult {
  const events: GameEvent[] = []
  let current = state

  for (let guard = 0; guard < 1000; guard += 1) {
    if (current.winner !== null) break
    if (current.pendingChoice) break

    const index = stepIndex(current.phase, current.step)
    const def = TURN_STEPS[index]
    if (!def) break

    // The Main Phase is where the Turn Player acts; hand them Priority and wait.
    if (def.grantsPriority) {
      if (!current.stepTaskDone) {
        current = { ...runStepTask(current, events), stepTaskDone: true }
        current = checkWin(current, events)
      }
      if (current.priority === null) {
        current = { ...current, priority: current.turnPlayer }
      }
      break
    }

    if (!current.stepTaskDone) {
      current = { ...runStepTask(current, events), stepTaskDone: true }
      current = checkWin(current, events)
      if (current.winner !== null) break
    }

    const nextDef = TURN_STEPS[index + 1]
    current = nextDef
      ? { ...current, phase: nextDef.phase, step: nextDef.step, stepTaskDone: false }
      : beginTurn(current)
  }

  return { state: current, events }
}

/** End the Main Phase and move to the Ending Phase (316.9). */
export function endMainPhase(state: GameState): GameState {
  return {
    ...state,
    phase: 'ending',
    step: 'ending',
    stepTaskDone: false,
    priority: null,
    focus: null,
  }
}
