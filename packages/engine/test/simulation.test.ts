import { describe, expect, it } from 'vitest'

import { applyAction, createGame, legalActions, oracleFrom } from '../src/index.js'
import type { CardFacts, DeckList, GameAction, GameState, PlayerId } from '../src/index.js'
import { SeededRng } from '../src/rng.js'

/**
 * Random-play regression test — the M3 gate, in miniature.
 *
 * `tools/sim` runs thousands of games for exploration; this runs enough in CI to
 * catch a regression that the hand-written tests would miss. Three properties
 * have to hold:
 *
 *   1. Nothing throws.
 *   2. Every game terminates.
 *   3. Every action `legalActions` offers, `applyAction` accepts.
 *
 * The third is the one hand-written tests cannot cover: the two functions are
 * written separately, and a disagreement between them strands a real player
 * mid-game with an option that does not work.
 */

const unit = (name: string, might: number, energy: number): CardFacts => ({
  type: 'unit',
  name,
  domains: ['fury'],
  tags: [],
  might,
  keywords: [],
  cost: { energy, power: [] },
  abilities: [],
})

const oracle = oracleFrom({
  'S-1': unit('Scout', 1, 1),
  'S-2': unit('Guard', 2, 2),
  'S-3': unit('Knight', 3, 3),
  'S-5': unit('Titan', 5, 5),
  'S-BOLT': {
    type: 'spell',
    name: 'Bolt',
    domains: ['fury'],
    tags: [],
    keywords: ['action'],
    cost: { energy: 1, power: [] },
    abilities: [
      {
        id: 'bolt',
        kind: 'spell',
        steps: [
          { op: 'choose', as: '$victim', from: { kind: 'unit', at: 'any-battlefield' } },
          { op: 'deal', amount: 2, target: '$victim' },
        ],
      },
    ],
  },
  'S-RUNE': {
    type: 'rune',
    name: 'Rune',
    domains: ['fury'],
    tags: [],
    keywords: [],
    abilities: [{ id: 'tap', kind: 'activated', exhaust: true, steps: [{ op: 'add', energy: 1 }] }],
  },
  'S-BF': {
    type: 'battlefield',
    name: 'Ruins',
    domains: [],
    tags: [],
    keywords: [],
    abilities: [],
  },
  'S-LEG': {
    type: 'legend',
    name: 'Legend',
    domains: ['fury'],
    tags: ['Sim'],
    keywords: [],
    abilities: [],
  },
})

const DECK: DeckList = {
  legend: 'S-LEG',
  champion: 'S-3',
  battlefields: ['S-BF', 'S-BF', 'S-BF'],
  main: Array.from(
    { length: 40 },
    (_, i) => (['S-1', 'S-2', 'S-3', 'S-5', 'S-BOLT'] as const)[i % 5] as string,
  ),
  runes: Array.from({ length: 12 }, () => 'S-RUNE'),
}

interface Outcome {
  readonly winner: PlayerId | null
  readonly actions: number
  readonly failure?: string
}

function fillIn(state: GameState, action: GameAction, rng: SeededRng): GameAction {
  if (action.type === 'resolve-choice') {
    const pending = state.pendingChoice
    if (!pending) return action
    const count = pending.min + rng.nextInt(Math.max(1, pending.max - pending.min + 1))
    return { ...action, chosen: rng.shuffle(pending.candidates).slice(0, count) }
  }
  if (action.type === 'mulligan') {
    const hand = state.players[action.player].hand
    return {
      ...action,
      setAside: rng.shuffle(hand).slice(0, rng.nextInt(Math.min(3, hand.length + 1))),
    }
  }
  return action
}

function playGame(seed: number, maxActions = 3000): Outcome {
  const rng = SeededRng.fromSeed(seed)
  let state = createGame([DECK, DECK], seed)
  let actions = 0

  while (state.winner === null && actions < maxActions) {
    const player = state.pendingChoice ? state.pendingChoice.player : state.priority
    if (player === null) {
      return { winner: null, actions, failure: `nobody to act at ${state.phase}/${state.step}` }
    }

    // Conceding would end every game instantly and test nothing.
    const options = legalActions(state, player, oracle).filter((a) => a.type !== 'concede')
    if (options.length === 0) {
      return {
        winner: null,
        actions,
        failure: `no legal action for p${String(player)} at ${state.phase}/${state.step}`,
      }
    }

    const picked = fillIn(state, options[rng.nextInt(options.length)] as GameAction, rng)
    const result = applyAction(state, picked, oracle)
    if (!result.ok) {
      return {
        winner: null,
        actions,
        failure: `offered ${picked.type} then rejected it: ${result.error.code}`,
      }
    }
    state = result.state
    actions += 1
  }

  if (state.winner === null) {
    return { winner: null, actions, failure: `did not terminate in ${String(maxActions)} actions` }
  }
  return { winner: state.winner, actions }
}

describe('random play', () => {
  it('plays 150 games to completion without a single failure', () => {
    const failures: string[] = []
    for (let seed = 1; seed <= 150; seed += 1) {
      const outcome = playGame(seed)
      if (outcome.failure) failures.push(`seed ${String(seed)}: ${outcome.failure}`)
    }
    expect(failures).toEqual([])
  })

  it('reaches a winner rather than stalling or decking out', () => {
    // If games ended by Burn Out rather than scoring, something is wrong with
    // the board: units would never be reaching battlefields.
    const winners = new Set<PlayerId | null>()
    for (let seed = 200; seed <= 240; seed += 1) {
      winners.add(playGame(seed).winner)
    }
    expect(winners.has(null)).toBe(false)
    // Both seats should win sometimes; one seat never winning would point at a
    // structural bias rather than variance.
    expect(winners.size).toBe(2)
  })

  it('is deterministic — the same seed replays identically', () => {
    const first = playGame(4242)
    const second = playGame(4242)
    expect(first).toEqual(second)
  })
})
