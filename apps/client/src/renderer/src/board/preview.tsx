/**
 * The playmat, on its own, for looking at.
 *
 * Runs a real game in the browser — the same engine and the same card data the
 * server uses — so the mat can be worked on without a server, an account or a
 * second client. It is a development harness: nothing here ships in the app,
 * and the app's own board never runs the engine locally.
 *
 *   npm run board -w @rb/client   →  http://localhost:5199/preview.html
 */

import { StrictMode, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'

import { cardOracle } from '@rb/cards'
import { SeededRng, applyAction, createGame, legalActions, redactFor } from '@rb/engine'
import type { GameAction, GameState, PlayerId } from '@rb/engine'
import { PROVING_GROUNDS_DECKS } from '@rb/cards'

import { Playmat } from './Playmat.js'
import { setArtResolver } from './art.js'
import type { MatchSession } from '../../../shared/match.js'
import '../styles.css'
import '../board.css'

const oracle = cardOracle()
const SEAT: PlayerId = 0

/** Card faces straight from the manifest; the app goes through its main process. */
async function loadArt(): Promise<void> {
  try {
    const response = await fetch('/card-art.json')
    if (!response.ok) return
    const manifest = (await response.json()) as Record<string, string>
    setArtResolver((cardId) => manifest[cardId] ?? '')
  } catch {
    // No manifest: the frames are the board.
  }
}

/** Fill in the parts of an action a legal-action template leaves open. */
function concrete(state: GameState, action: GameAction, rng: SeededRng): GameAction {
  if (action.type === 'resolve-choice' && state.pendingChoice) {
    const choice = state.pendingChoice
    const count = choice.min + rng.nextInt(Math.max(1, choice.max - choice.min + 1))
    return { ...action, chosen: rng.shuffle(choice.candidates).slice(0, count) }
  }
  if (action.type === 'mulligan') return { ...action, setAside: [] }
  return action
}

/** Units on the board: what makes a position worth looking at. */
function liveliness(state: GameState): number {
  let score = 0
  for (const object of Object.values(state.objects)) {
    if (oracle.facts(object.cardId)?.type !== 'unit') continue
    if (object.zone === 'battlefield') score += 3
    else if (object.zone === 'base') score += 1
  }
  return score + (state.showdown ? 4 : 0)
}

/**
 * A position with something on the table.
 *
 * Random play is what the engine's own simulator does; here it is run from
 * several seeds and the busiest board wins, so the mat is worked on against a
 * real mid-game position rather than an empty one.
 */
function opening(turns: number): GameState {
  let best: GameState | null = null
  for (let seed = 1; seed <= 40; seed += 1) {
    const state = playOut(seed, turns)
    if (!best || liveliness(state) > liveliness(best)) best = state
    if (best && liveliness(best) >= 14) break
  }
  if (!best) throw new Error('no position')
  return best
}

/** A game that has only just been dealt: the Mulligan is the first thing to do. */
function fresh(): GameState {
  const [mine, theirs] = [PROVING_GROUNDS_DECKS[3], PROVING_GROUNDS_DECKS[2]]
  if (!mine || !theirs) throw new Error('missing starter deck')
  return createGame([mine.deck, theirs.deck], 11)
}

function playOut(seed: number, turns: number): GameState {
  const rng = SeededRng.fromSeed(seed)
  const [mine, theirs] = [PROVING_GROUNDS_DECKS[3], PROVING_GROUNDS_DECKS[2]]
  if (!mine || !theirs) throw new Error('missing starter deck')
  let state = createGame([mine.deck, theirs.deck], 11)
  for (let i = 0; i < 2000 && state.winner === null; i += 1) {
    // Stop on the player's own Main Phase, where the mat has the most to show.
    if (
      state.turnNumber >= turns &&
      state.turnPlayer === SEAT &&
      state.priority === SEAT &&
      state.phase === 'main' &&
      state.chain.length === 0 &&
      !state.pendingChoice
    ) {
      break
    }
    const actor: PlayerId | null = state.pendingChoice ? state.pendingChoice.player : state.priority
    if (actor === null) break
    // Passing is how a turn moves on, but a board full of cards is the point:
    // prefer doing something, and pass only when there is nothing else.
    const legal = legalActions(state, actor, oracle).filter((a) => a.type !== 'concede')
    const doing = legal.filter((a) => a.type !== 'pass')
    const options = doing.length > 0 && rng.nextInt(4) > 0 ? doing : legal
    const pick = options[rng.nextInt(Math.max(1, options.length))]
    const chosen: GameAction = pick ?? { type: 'pass', player: actor }
    const result = applyAction(state, concrete(state, chosen, rng), oracle)
    if (result.ok) {
      state = result.state
      continue
    }
    const passed = applyAction(state, { type: 'pass', player: actor }, oracle)
    if (!passed.ok) break
    state = passed.state
  }
  return state
}

/** `?scene=mulligan` shows the opening prompt instead of a mid-game board. */
function scene(): GameState {
  const wanted = new URLSearchParams(location.search).get('scene')
  return wanted === 'mulligan' ? fresh() : opening(7)
}

function Harness() {
  const [state, setState] = useState<GameState>(scene)
  const [error, setError] = useState<string | null>(null)

  const session: MatchSession = useMemo(
    () => ({
      id: 'preview',
      seat: SEAT,
      players: [
        { name: 'You', kind: 'user' },
        { name: 'Wuju Bladesman', kind: 'user' },
      ],
      view: redactFor(state, SEAT),
      legal: legalActions(state, SEAT, oracle),
      seq: 0,
      ended: state.winner === null ? null : { winner: state.winner, reason: 'victory' },
      opponentAwayUntil: null,
    }),
    [state],
  )

  const send = (action: GameAction): void => {
    const result = applyAction(state, action, oracle)
    if (!result.ok) {
      setError(`${action.type}: ${result.error.message}`)
      return
    }
    setError(null)
    let next = result.state
    // Let the other side take its turn, so the board keeps moving.
    const rng = SeededRng.fromSeed(next.nextObjectId + 1)
    for (let i = 0; i < 200; i += 1) {
      const actor: PlayerId | null = next.pendingChoice ? next.pendingChoice.player : next.priority
      if (actor === null || actor === SEAT || next.winner !== null) break
      const options = legalActions(next, actor, oracle).filter((a) => a.type !== 'concede')
      const pick = options[rng.nextInt(Math.max(1, options.length))] ?? {
        type: 'pass' as const,
        player: actor,
      }
      const stepped = applyAction(next, concrete(next, pick, rng), oracle)
      if (!stepped.ok) break
      next = stepped.state
    }
    setState(next)
  }

  const view = session.view
  if (!view) return <div className="splash">no view</div>
  return (
    <>
      {error && <div className="banner">{error}</div>}
      <Playmat mat={{ session, view, send }} />
    </>
  )
}

const root = document.getElementById('root')
if (!root) throw new Error('missing #root')
void loadArt().then(() => {
  createRoot(root).render(
    <StrictMode>
      <Harness />
    </StrictMode>,
  )
})
