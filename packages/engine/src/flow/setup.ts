/**
 * Setting up a game (110-118, 485.5).
 *
 * The order is fixed: Legend to the Legend Zone, Chosen Champion to the Champion
 * Zone, Battlefields set aside, both decks shuffled separately, Turn Order
 * decided, four cards each, then the Mulligan in turn order.
 *
 * In a Duel each player brings three Battlefields and one of them is chosen at
 * random; the other two are removed from the game entirely (485.5). Both are
 * placed simultaneously, so the Battlefield Zone always holds exactly two.
 */

import type { GameEvent } from '../effects/events.js'
import { EMPTY_POOL } from '../model/cost.js'
import { SeededRng } from '../rng.js'
import type {
  BattlefieldState,
  CardId,
  GameObject,
  GameState,
  ObjectId,
  PlayerId,
  PlayerState,
} from '../state/game-state.js'

/** Everything a player brings to a game (103). */
export interface DeckList {
  readonly legend: CardId
  readonly champion: CardId
  /** Three for a Duel; one is chosen at random during setup (485.4.a). */
  readonly battlefields: readonly CardId[]
  /** At least 40 cards (103.2). */
  readonly main: readonly CardId[]
  /** Exactly 12 (103.3.a). */
  readonly runes: readonly CardId[]
}

/** Cards drawn in the opening hand (116). */
export const OPENING_HAND = 4

/** Cards a player may set aside during their Mulligan (117.1). */
export const MULLIGAN_LIMIT = 2

interface Builder {
  objects: Record<ObjectId, GameObject>
  next: number
}

function mint(
  builder: Builder,
  cardId: CardId,
  owner: PlayerId,
  zone: GameObject['zone'],
): ObjectId {
  const id = `o${String(builder.next)}`
  builder.next += 1
  builder.objects[id] = {
    id,
    cardId,
    owner,
    controller: owner,
    zone,
    exhausted: false,
    damage: 0,
    buffs: 0,
    faceDown: false,
  }
  return id
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

/**
 * Build a game ready for the first Mulligan.
 *
 * Everything random here — deck shuffles, the Battlefield choice, and who goes
 * first — comes from the seeded RNG, so the same seed and decklists always
 * produce the same opening position.
 */
export function createGame(
  decks: readonly [DeckList, DeckList],
  seed: number,
  events: GameEvent[] = [],
): GameState {
  const rng = SeededRng.fromSeed(seed)
  const builder: Builder = { objects: {}, next: 1 }
  const players: Record<PlayerId, PlayerState> = { 0: emptyPlayer(0), 1: emptyPlayer(1) }
  const battlefields: BattlefieldState[] = []

  for (const seat of [0, 1] as const) {
    const deck = decks[seat]

    // 111, 112 - Legend and Chosen Champion to their zones.
    const legend = mint(builder, deck.legend, seat, 'legendZone')
    const champion = mint(builder, deck.champion, seat, 'championZone')

    // 114 - shuffle Main and Rune decks separately.
    const main = rng.shuffle(deck.main.map((card) => mint(builder, card, seat, 'mainDeck')))
    const runes = rng.shuffle(deck.runes.map((card) => mint(builder, card, seat, 'runeDeck')))

    // 485.5 - one Battlefield chosen at random; the other two are removed and
    // never enter the game, so they are not minted as objects at all.
    const chosen = rng.pick(deck.battlefields)
    if (chosen !== undefined) {
      const id = mint(builder, chosen, seat, 'battlefield')
      battlefields.push({ id, contested: false, facedown: [] })
    }

    players[seat] = {
      ...players[seat],
      legendZone: [legend],
      championZone: [champion],
      mainDeck: main,
      runeDeck: runes,
    }
  }

  // 116 - each player draws 4.
  for (const seat of [0, 1] as const) {
    const player = players[seat]
    const hand = player.mainDeck.slice(0, OPENING_HAND)
    for (const id of hand) {
      const object = builder.objects[id]
      if (object) builder.objects[id] = { ...object, zone: 'hand' }
    }
    players[seat] = {
      ...player,
      hand,
      mainDeck: player.mainDeck.slice(OPENING_HAND),
    }
  }

  // 115 - Turn Order by a fair random method. The First Player takes the first
  // turn (115.1.b.1), and in a Duel the other player channels an extra rune on
  // their first Channel Phase (485.7).
  const first: PlayerId = rng.nextInt(2) === 0 ? 0 : 1
  events.push({ type: 'game-started', firstPlayer: first })

  return {
    rng: rng.state,
    objects: builder.objects,
    players,
    battlefields,
    turnPlayer: first,
    turnNumber: 1,
    // 117 - the Mulligan happens in turn order before play begins.
    phase: 'setup',
    step: 'mulligan',
    stepTaskDone: false,
    chain: [],
    priority: first,
    focus: null,
    pendingChoice: null,
    resolving: null,
    consecutivePasses: 0,
    winner: null,
    nextObjectId: builder.next,
  }
}

/**
 * Perform one player's Mulligan (117).
 *
 * Set aside up to two cards, draw that many, then Recycle the set-aside cards.
 * The order matters: the replacements are drawn *before* the originals go back,
 * so a mulliganed card cannot be immediately redrawn.
 */
export function performMulligan(
  state: GameState,
  player: PlayerId,
  setAside: readonly ObjectId[],
  events: GameEvent[],
): GameState {
  const p = state.players[player]
  const kept = p.hand.filter((id) => !setAside.includes(id))

  // 117.2 - draw as many as were set aside, from the deck as it stands.
  const drawn = p.mainDeck.slice(0, setAside.length)
  const rest = p.mainDeck.slice(setAside.length)

  const objects = { ...state.objects }
  for (const id of drawn) {
    const object = objects[id]
    if (object) objects[id] = { ...object, zone: 'hand' }
  }

  // 117.3 - Recycle the set-aside cards. Several going back at once are placed
  // on the bottom in random order (416.5).
  const rng = SeededRng.fromState(state.rng)
  const returned = rng.shuffle(setAside)
  for (const id of returned) {
    const object = objects[id]
    if (object) objects[id] = { ...object, zone: 'mainDeck' }
  }

  if (setAside.length > 0) {
    events.push({ type: 'mulliganed', player, count: setAside.length })
  }

  return {
    ...state,
    rng: rng.state,
    objects,
    players: {
      ...state.players,
      [player]: { ...p, hand: [...kept, ...drawn], mainDeck: [...rest, ...returned] },
    },
  }
}

/** Is the game still in setup, waiting on Mulligans? */
export function inSetup(state: GameState): boolean {
  return state.phase === 'setup'
}

/**
 * Leave setup and begin the First Player's turn (118).
 *
 * The caller runs the flow machine afterwards, which performs the Awaken,
 * Beginning, Channel and Draw phases before anyone acts.
 */
export function beginPlay(state: GameState, firstPlayer: PlayerId): GameState {
  return {
    ...state,
    turnPlayer: firstPlayer,
    turnNumber: 1,
    phase: 'awaken',
    step: 'ready',
    stepTaskDone: false,
    priority: null,
    focus: null,
  }
}
