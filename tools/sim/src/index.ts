/**
 * Headless random-play simulator.
 *
 * Two players pick uniformly at random from `legalActions` until someone wins.
 * This is not an AI and never ships to players — it exists to exercise the
 * engine in situations nobody wrote a test for. Three things must hold across
 * thousands of games:
 *
 *   1. Nothing throws.
 *   2. Every game terminates.
 *   3. Every action the engine offered is one the engine accepts.
 *
 * That last check matters most: `legalActions` and `applyAction` are written
 * separately, and a disagreement between them is a bug a human would only find
 * by getting stuck mid-game.
 *
 * Cards here are synthetic. The point is to stress the rules, not the set — and
 * the real set has no runes or battlefields authored yet.
 *
 * Usage: npm run sim -- [--games 1000] [--seed 1] [--verbose]
 */

import { SeededRng, applyAction, createGame, legalActions, oracleFrom } from '@rb/engine'
import type { CardFacts, DeckList, GameAction, GameState, PlayerId } from '@rb/engine'

// ---------------------------------------------------------------------------
// A synthetic card pool
// ---------------------------------------------------------------------------

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

const POOL: Record<string, CardFacts> = {
  'SIM-001': unit('Scout', 1, 1),
  'SIM-002': unit('Guard', 2, 2),
  'SIM-003': unit('Knight', 3, 3),
  'SIM-004': unit('Titan', 5, 5),
  'SIM-005': {
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
  'SIM-006': {
    type: 'spell',
    name: 'Study',
    domains: ['fury'],
    tags: [],
    keywords: [],
    cost: { energy: 2, power: [] },
    abilities: [{ id: 'study', kind: 'spell', steps: [{ op: 'draw', amount: 1 }] }],
  },
  'SIM-RUNE': {
    type: 'rune',
    name: 'Fury Rune',
    domains: ['fury'],
    tags: [],
    keywords: [],
    abilities: [{ id: 'tap', kind: 'activated', exhaust: true, steps: [{ op: 'add', energy: 1 }] }],
  },
  'SIM-BF': {
    type: 'battlefield',
    name: 'Ruins',
    domains: [],
    tags: [],
    keywords: [],
    abilities: [],
  },
  'SIM-LEGEND': {
    type: 'legend',
    name: 'Sim Legend',
    domains: ['fury'],
    tags: ['Sim'],
    keywords: [],
    abilities: [],
  },
}

const oracle = oracleFrom(POOL)

function makeDeck(): DeckList {
  const main: string[] = []
  // 40 cards, weighted toward units so battlefields actually get contested.
  for (let i = 0; i < 40; i += 1) {
    const cards = ['SIM-001', 'SIM-002', 'SIM-003', 'SIM-004', 'SIM-005', 'SIM-006']
    main.push(cards[i % cards.length] as string)
  }
  return {
    legend: 'SIM-LEGEND',
    champion: 'SIM-003',
    battlefields: ['SIM-BF', 'SIM-BF', 'SIM-BF'],
    main,
    runes: Array.from({ length: 12 }, () => 'SIM-RUNE'),
  }
}

// ---------------------------------------------------------------------------
// Choosing an action
// ---------------------------------------------------------------------------

/**
 * Turn a legal-action template into something concrete.
 *
 * `legalActions` returns placeholders for choices whose contents depend on the
 * pending prompt, so the simulator fills them from the state.
 */
function concrete(state: GameState, action: GameAction, rng: SeededRng): GameAction {
  if (action.type === 'resolve-choice') {
    const pending = state.pendingChoice
    if (!pending) return action
    const shuffled = rng.shuffle(pending.candidates)
    const count = pending.min + rng.nextInt(Math.max(1, pending.max - pending.min + 1))
    return { ...action, chosen: shuffled.slice(0, Math.min(count, pending.max)) }
  }
  if (action.type === 'mulligan') {
    const hand = state.players[action.player].hand
    const count = rng.nextInt(Math.min(3, hand.length + 1))
    return { ...action, setAside: rng.shuffle(hand).slice(0, count) }
  }
  return action
}

/** Who the engine is currently waiting on, if anyone. */
function actingPlayer(state: GameState): PlayerId | null {
  if (state.pendingChoice) return state.pendingChoice.player
  return state.priority
}

export interface GameReport {
  readonly seed: number
  readonly winner: PlayerId | null
  readonly actions: number
  readonly turns: number
  /** How many of each event the game produced, for spotting degenerate runs. */
  readonly eventCounts: Readonly<Record<string, number>>
  readonly error?: string
}

const MAX_ACTIONS = 5000

/** Play one game to completion. */
export function playGame(seed: number, verbose = false): GameReport {
  const rng = SeededRng.fromSeed(seed)
  let state = createGame([makeDeck(), makeDeck()], seed)
  let actions = 0
  const eventCounts: Record<string, number> = {}

  while (state.winner === null && actions < MAX_ACTIONS) {
    const player = actingPlayer(state)
    if (player === null) {
      return {
        seed,
        winner: null,
        actions,
        turns: state.turnNumber,
        eventCounts,
        error: `nobody to act at ${state.phase}/${state.step}`,
      }
    }

    const options = legalActions(state, player, oracle)
    // Conceding is always available; a simulator that picks it would end every
    // game immediately and test nothing.
    const usable = options.filter((a) => a.type !== 'concede')
    if (usable.length === 0) {
      return {
        seed,
        winner: null,
        actions,
        turns: state.turnNumber,
        eventCounts,
        error: `no legal action for player ${String(player)} at ${state.phase}/${state.step}`,
      }
    }

    const picked = concrete(state, usable[rng.nextInt(usable.length)] as GameAction, rng)
    const result = applyAction(state, picked, oracle)
    if (!result.ok) {
      return {
        seed,
        winner: null,
        actions,
        turns: state.turnNumber,
        eventCounts,
        error: `offered ${picked.type} but rejected it: ${result.error.code} (${result.error.message})`,
      }
    }
    if (verbose) {
      console.log(`  ${String(actions)} p${String(player)} ${picked.type}`)
    }
    for (const event of result.events) {
      eventCounts[event.type] = (eventCounts[event.type] ?? 0) + 1
    }
    state = result.state
    actions += 1
  }

  if (state.winner === null) {
    return {
      seed,
      winner: null,
      actions,
      turns: state.turnNumber,
      eventCounts,
      error: `did not terminate within ${String(MAX_ACTIONS)} actions`,
    }
  }
  return { seed, winner: state.winner, actions, turns: state.turnNumber, eventCounts }
}

function main(): number {
  const args = process.argv.slice(2)
  const flag = (name: string, fallback: number) => {
    const index = args.indexOf(`--${name}`)
    return index >= 0 ? Number(args[index + 1] ?? fallback) : fallback
  }
  const games = flag('games', 200)
  const startSeed = flag('seed', 1)
  const verbose = args.includes('--verbose')

  const failures: GameReport[] = []
  let wins: Record<string, number> = { '0': 0, '1': 0 }
  let totalActions = 0
  let totalTurns = 0
  let minTurns = Number.POSITIVE_INFINITY
  let maxTurns = 0
  const eventTotals: Record<string, number> = {}

  for (let i = 0; i < games; i += 1) {
    const seed = startSeed + i
    let report: GameReport
    try {
      report = playGame(seed, verbose)
    } catch (error) {
      report = {
        seed,
        winner: null,
        actions: 0,
        turns: 0,
        eventCounts: {},
        error: `threw: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
    if (report.error) failures.push(report)
    else {
      wins = { ...wins, [String(report.winner)]: (wins[String(report.winner)] ?? 0) + 1 }
      totalActions += report.actions
      totalTurns += report.turns
      minTurns = Math.min(minTurns, report.turns)
      maxTurns = Math.max(maxTurns, report.turns)
      for (const [type, count] of Object.entries(report.eventCounts)) {
        eventTotals[type] = (eventTotals[type] ?? 0) + count
      }
    }
  }

  const ok = games - failures.length
  console.log(
    `sim: ${String(games)} game(s), ${String(ok)} completed, ${String(failures.length)} failed`,
  )
  if (ok > 0) {
    console.log(`  wins: p0 ${String(wins['0'] ?? 0)} / p1 ${String(wins['1'] ?? 0)}`)
    console.log(
      `  average: ${(totalActions / ok).toFixed(1)} actions, ${(totalTurns / ok).toFixed(1)} turns`,
    )
    const interesting = ['points-gained', 'burned-out', 'combat-began', 'killed', 'moved']
    const parts = interesting
      .map((type) => `${type} ${((eventTotals[type] ?? 0) / ok).toFixed(1)}`)
      .join(', ')
    console.log(`  per game: ${parts}`)
    console.log(`  turn spread: min ${String(minTurns)}, max ${String(maxTurns)}`)
  }

  if (failures.length > 0) {
    console.error('\nfailures:')
    const seen = new Set<string>()
    for (const failure of failures) {
      const key = failure.error ?? ''
      if (seen.has(key)) continue
      seen.add(key)
      console.error(`  seed ${String(failure.seed)} after ${String(failure.actions)} actions:`)
      console.error(`    ${key}`)
    }
    console.error(
      `\n${String(seen.size)} distinct failure(s) across ${String(failures.length)} game(s)`,
    )
    return 1
  }
  return 0
}

if (process.argv[1]?.includes('sim')) {
  process.exit(main())
}
