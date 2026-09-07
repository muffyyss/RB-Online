/**
 * Redaction — deriving what one player is allowed to see.
 *
 * The server holds the full state and sends each player only their own view.
 * This single function is what makes "read the opponent's hand" cheats
 * impossible rather than merely discouraged: hidden cards are not obscured in
 * the payload, they are *absent* from it.
 *
 * Privacy levels come from the rulebook (128): **Secret** (nobody may look),
 * **Private** (only the controller of a card on the board, or the owner of a
 * card anywhere else — 128.4), **Public** (anyone). A card's privacy defaults to
 * its zone's (128.2.a). The mapping is tabulated in rules-spec §2.
 */

import type {
  BattlefieldState,
  ChainItem,
  GameObject,
  GameState,
  ObjectId,
  PendingChoice,
  Phase,
  PlayerId,
  Step,
  TurnState,
} from './game-state.js'
import { PLAYERS, turnStateOf } from './game-state.js'
import type { RunePool } from '../model/cost.js'

/**
 * A zone as one player sees it.
 *
 * `count` is always present — the *number* of cards in hand is Public even
 * though their faces are not (108.7.e). `cards` appears only when the viewer is
 * entitled to the contents, so a missing list is a hard guarantee rather than a
 * hint to the client.
 */
export interface ZoneView {
  readonly count: number
  readonly cards?: readonly ObjectId[]
}

export interface PlayerView {
  readonly id: PlayerId
  readonly points: number
  readonly hand: ZoneView
  readonly mainDeck: ZoneView
  readonly runeDeck: ZoneView
  readonly trash: ZoneView
  readonly banishment: ZoneView
  readonly championZone: ZoneView
  readonly legendZone: ZoneView
  readonly base: ZoneView
  readonly runePool: RunePool
  readonly scoredThisTurn: readonly ObjectId[]
}

/** A pending choice as seen by someone who is not the one choosing. */
export interface PendingChoiceView {
  readonly player: PlayerId
  readonly binding: string
  readonly optional: boolean
  /** Candidates are present only for the player actually choosing. */
  readonly candidates?: readonly ObjectId[]
  readonly candidateCount: number
  readonly min: number
  readonly max: number
}

export interface GameView {
  readonly viewer: PlayerId
  /** Only objects this viewer may see. Everything else is simply not here. */
  readonly objects: Readonly<Record<ObjectId, GameObject>>
  readonly players: Readonly<Record<PlayerId, PlayerView>>
  readonly battlefields: readonly BattlefieldState[]
  readonly turnPlayer: PlayerId
  readonly turnNumber: number
  readonly phase: Phase
  readonly step: Step
  readonly turnState: TurnState
  readonly chain: readonly ChainItem[]
  readonly showdown?: { readonly battlefield: ObjectId; readonly combat: boolean }
  readonly priority: PlayerId | null
  readonly focus: PlayerId | null
  readonly pendingChoice: PendingChoiceView | null
  readonly winner: PlayerId | null
}

/**
 * May `viewer` see this object's face?
 *
 * The deliberate omission is the decks. 129.3 puts Main Deck cards in the same
 * bracket as cards in hand — back side presented to conceal Private or Secret
 * information — and 108.4.d makes the *order* Secret, a level nobody may look at
 * (128.3). So deck cards are hidden from **both** players, including their
 * owner. Exposing "what is left in my deck" would leak a real advantage.
 */
export function canSee(object: GameObject, viewer: PlayerId): boolean {
  switch (object.zone) {
    // Public zones (107.1.d, 107.2.c, 108.1.b, 108.2.d, 108.3.e, 108.6.e, 107.4.c).
    case 'base':
    case 'battlefield':
    case 'chain':
    case 'trash':
    case 'banishment':
    case 'championZone':
    case 'legendZone':
      // A facedown card on the board stays Private even in a public zone
      // (129.4) — its controller may look, nobody else.
      return object.faceDown ? object.controller === viewer : true

    // Private to the owner (108.7.c).
    case 'hand':
      return object.owner === viewer

    // Private to the controller of the associated Battlefield (107.3.c, 107.3.f).
    case 'facedown':
      return object.controller === viewer

    // Concealed from everyone (129.3, 108.4.d, 108.5.d).
    case 'mainDeck':
    case 'runeDeck':
      return false
  }
}

function zoneView(
  ids: readonly ObjectId[],
  state: GameState,
  viewer: PlayerId,
  alwaysHidden = false,
): ZoneView {
  if (alwaysHidden) return { count: ids.length }
  const visible = ids.every((id) => {
    const object = state.objects[id]
    return object ? canSee(object, viewer) : false
  })
  return visible ? { count: ids.length, cards: ids } : { count: ids.length }
}

function redactPlayer(state: GameState, player: PlayerId, viewer: PlayerId): PlayerView {
  const p = state.players[player]
  return {
    id: p.id,
    points: p.points,
    // Own hand in full; an opponent gets the count only (108.7.c, 108.7.e).
    hand: zoneView(p.hand, state, viewer),
    // Decks: length only, to everyone.
    mainDeck: { count: p.mainDeck.length },
    runeDeck: { count: p.runeDeck.length },
    trash: zoneView(p.trash, state, viewer),
    banishment: zoneView(p.banishment, state, viewer),
    championZone: zoneView(p.championZone, state, viewer),
    legendZone: zoneView(p.legendZone, state, viewer),
    base: zoneView(p.base, state, viewer),
    runePool: p.runePool,
    scoredThisTurn: p.scoredThisTurn,
  }
}

function redactChoice(choice: PendingChoice | null, viewer: PlayerId): PendingChoiceView | null {
  if (!choice) return null
  const base = {
    player: choice.player,
    binding: choice.binding,
    optional: choice.optional,
    candidateCount: choice.candidates.length,
    min: choice.min,
    max: choice.max,
  }
  // That a choice is pending is public — the opponent can see the game waiting.
  // *What* may be chosen is not: candidates can include cards in hand.
  return choice.player === viewer ? { ...base, candidates: choice.candidates } : base
}

/**
 * Build the view for one player.
 *
 * Everything the viewer may not see is dropped, not masked. If a field is
 * missing from the result, it was never serialised, so it cannot leak through a
 * client bug or a curious devtools session.
 */
export function redactFor(state: GameState, viewer: PlayerId): GameView {
  const objects: Record<ObjectId, GameObject> = {}
  for (const [id, object] of Object.entries(state.objects)) {
    if (canSee(object, viewer)) objects[id] = object
  }

  const players = {} as Record<PlayerId, PlayerView>
  for (const player of PLAYERS) {
    players[player] = redactPlayer(state, player, viewer)
  }

  const view: GameView = {
    viewer,
    objects,
    players,
    battlefields: state.battlefields,
    turnPlayer: state.turnPlayer,
    turnNumber: state.turnNumber,
    phase: state.phase,
    step: state.step,
    turnState: turnStateOf(state),
    chain: state.chain,
    priority: state.priority,
    focus: state.focus,
    pendingChoice: redactChoice(state.pendingChoice, viewer),
    winner: state.winner,
  }
  return state.showdown ? { ...view, showdown: state.showdown } : view
}

/**
 * Every object id the viewer must not learn about.
 *
 * Used by the anti-cheat test: serialise a view and assert none of these appear
 * anywhere in the payload.
 */
export function hiddenIdsFor(state: GameState, viewer: PlayerId): readonly ObjectId[] {
  return Object.values(state.objects)
    .filter((object) => !canSee(object, viewer))
    .map((object) => object.id)
}
