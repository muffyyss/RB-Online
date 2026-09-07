/**
 * The game state.
 *
 * Plain, serialisable data — no classes with behaviour, no functions, nothing
 * that cannot survive `JSON.stringify`. A match is stored as a seed plus an
 * ordered action log and rebuilt by replay, so every field here has to round-trip
 * exactly. The RNG is kept as its serialisable state for the same reason.
 *
 * Zone membership lives in ordered `ObjectId` lists, while the objects
 * themselves live in one flat map. Moving a card is then a list edit rather than
 * a copy, and an object can never accidentally exist in two zones at once.
 *
 * Layout follows rules-spec §3 (zones) and §4 (turn states).
 */

import type { RngState } from '../rng.js'
import type { Domain } from '../model/domain.js'
import type { RunePool } from '../model/cost.js'

/** Seat index. V1 is 1v1 (Duel) only — 2 players (485.1). */
export type PlayerId = 0 | 1

export const PLAYERS: readonly PlayerId[] = [0, 1]

export function opponentOf(player: PlayerId): PlayerId {
  return player === 0 ? 1 : 0
}

/** Stable instance id. Two copies of the same card are different objects. */
export type ObjectId = string

/** A card definition id, e.g. `OGS-003`. */
export type CardId = string

/**
 * Where an object lives.
 *
 * Bases and Battlefields are **Locations** — somewhere a unit can be and move
 * between (107.1.b, 107.2.b). The other zones are not; the Legend Zone and
 * Facedown Zones are explicitly excluded (107.4.b, 107.3.e).
 */
export type ZoneName =
  | 'hand'
  | 'mainDeck'
  | 'runeDeck'
  | 'trash'
  | 'banishment'
  | 'championZone'
  | 'legendZone'
  | 'base'
  | 'battlefield'
  | 'facedown'
  | 'chain'

/** A unit's Location is the Base or Battlefield it occupies (146.1). */
export type Location =
  | { readonly kind: 'base'; readonly player: PlayerId }
  | { readonly kind: 'battlefield'; readonly id: ObjectId }

/** Attacker/Defender designations, held only during a combat (464.2.c.3). */
export type CombatRole = 'attacker' | 'defender'

/** A card instance, wherever it currently is. */
export interface GameObject {
  readonly id: ObjectId
  readonly cardId: CardId
  /** Never changes. Cards always return to their owner's zones (416.1.c). */
  readonly owner: PlayerId
  /** May differ from owner while an effect grants control (191). */
  readonly controller: PlayerId
  readonly zone: ZoneName
  /** Set only while the object is on the board at a Location. */
  readonly location?: Location
  /** Turned sideways and unusable until readied (414, 415). */
  readonly exhausted: boolean
  /** Marked damage; healed at end of turn and in a Combat Cleanup (143.3.b). */
  readonly damage: number
  /** Buff counters, each worth +1 Might (702, 703). */
  readonly buffs: number
  /** Back side presented; its front is Private information (129.4). */
  readonly faceDown: boolean
  /** The object this is attached to, if any (434). */
  readonly attachedTo?: ObjectId
  readonly combatRole?: CombatRole
}

/** A Battlefield in the shared Battlefield Zone (107.2). */
export interface BattlefieldState {
  readonly id: ObjectId
  /** Uncontrolled until someone establishes Control (466.5.b). */
  readonly controller?: PlayerId
  /** Set when opposing units meet here; cleared on resolution (466.5.a). */
  readonly contested: boolean
  /** Max occupancy 1 by default (107.3.b). Cards here are Private (107.3.f). */
  readonly facedown: readonly ObjectId[]
}

export interface PlayerState {
  readonly id: PlayerId
  /** Victory Score for Duel is 8 (485.3). */
  readonly points: number
  readonly hand: readonly ObjectId[]
  readonly mainDeck: readonly ObjectId[]
  readonly runeDeck: readonly ObjectId[]
  readonly trash: readonly ObjectId[]
  readonly banishment: readonly ObjectId[]
  readonly championZone: readonly ObjectId[]
  readonly legendZone: readonly ObjectId[]
  /** Permanents and Runes this player controls (107.1.c). */
  readonly base: readonly ObjectId[]
  /** Empties at the start of Main and the end of the turn (167). */
  readonly runePool: RunePool
  /**
   * Battlefields this player has already Scored this turn.
   *
   * A player may Score each Battlefield at most once per turn (470), and the
   * Final Point rule asks whether they have Scored *every* Battlefield this
   * turn (471.1.b.1), so this has to be tracked rather than recomputed.
   */
  readonly scoredThisTurn: readonly ObjectId[]
}

/** Phases and steps of a turn (315-317). */
export type Phase = 'awaken' | 'beginning' | 'channel' | 'draw' | 'main' | 'ending'

export type Step =
  'ready' | 'beginning' | 'scoring' | 'channel' | 'draw' | 'main' | 'ending' | 'expiration'

/**
 * A pending or finalized item on the Chain (329).
 *
 * Items are appended in play order; the *oldest* Pending item finalizes first
 * (337.1.b) while the *newest* Finalized item resolves first (340.1).
 */
export interface ChainItem {
  readonly id: ObjectId
  readonly controller: PlayerId
  readonly source: ObjectId
  /** Which ability of the source, when the item is an ability rather than a card. */
  readonly abilityId?: string
  /** Pending until the Check Legality step of playing it (329.2). */
  readonly pending: boolean
  /** Objects chosen while playing it, keyed by binding name (`$victim`). */
  readonly bindings: Readonly<Record<string, readonly ObjectId[]>>
}

/**
 * A choice the engine is waiting on.
 *
 * The interpreter never blocks or awaits: when an effect needs a decision it
 * suspends here and the game cannot advance until this exact player answers.
 * Mid-resolution choices are the single largest source of TCG engine bugs, so
 * they are explicit state rather than a callback.
 */
export interface PendingChoice {
  readonly player: PlayerId
  readonly binding: string
  readonly candidates: readonly ObjectId[]
  readonly min: number
  readonly max: number
  /** Whether the player may decline (a "may" choice). */
  readonly optional: boolean
}

export interface GameState {
  readonly rng: RngState
  readonly objects: Readonly<Record<ObjectId, GameObject>>
  readonly players: Readonly<Record<PlayerId, PlayerState>>
  /** Two Battlefields in a Duel, one contributed by each player (485.4). */
  readonly battlefields: readonly BattlefieldState[]

  readonly turnPlayer: PlayerId
  readonly turnNumber: number
  readonly phase: Phase
  readonly step: Step

  /** The Chain exists only while it holds an item (330). */
  readonly chain: readonly ChainItem[]
  /** A Showdown or Combat in progress puts the turn in a Showdown State (308.1). */
  readonly showdown?: { readonly battlefield: ObjectId; readonly combat: boolean }

  /** At most one player has Priority; sometimes nobody does (312, 312.1.b). */
  readonly priority: PlayerId | null
  /** At most one player has Focus; nobody does in a Neutral State (313, 313.5). */
  readonly focus: PlayerId | null

  readonly pendingChoice: PendingChoice | null
  readonly winner: PlayerId | null

  /** Source of fresh ObjectIds. Part of state so replay stays deterministic. */
  readonly nextObjectId: number
}

// ---------------------------------------------------------------------------
// Derived turn state (307-310)
// ---------------------------------------------------------------------------

/**
 * The four turn states are *derived*, never stored.
 *
 * They are pure functions of "is a Showdown or Combat in progress" and "does the
 * Chain hold anything". Storing them as flags would let them drift out of step
 * with the Chain, and every play-legality check depends on them.
 */
export function isShowdownState(state: GameState): boolean {
  return state.showdown !== undefined
}

/** A Chain exists as long as an item is on it (330). */
export function isClosedState(state: GameState): boolean {
  return state.chain.length > 0
}

export type TurnState = 'neutral-open' | 'neutral-closed' | 'showdown-open' | 'showdown-closed'

export function turnStateOf(state: GameState): TurnState {
  const showdown = isShowdownState(state)
  const closed = isClosedState(state)
  if (showdown) return closed ? 'showdown-closed' : 'showdown-open'
  return closed ? 'neutral-closed' : 'neutral-open'
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

export function getObject(state: GameState, id: ObjectId): GameObject | undefined {
  return state.objects[id]
}

export function requireObject(state: GameState, id: ObjectId): GameObject {
  const object = state.objects[id]
  if (!object) throw new Error(`no such object: ${id}`)
  return object
}

export function playerState(state: GameState, player: PlayerId): PlayerState {
  return state.players[player]
}

export function battlefield(state: GameState, id: ObjectId): BattlefieldState | undefined {
  return state.battlefields.find((b) => b.id === id)
}

/** Objects a player controls at a given Location. */
export function objectsAt(state: GameState, location: Location): readonly GameObject[] {
  return Object.values(state.objects).filter((object) => {
    const at = object.location
    if (!at) return false
    if (at.kind !== location.kind) return false
    return at.kind === 'base'
      ? at.player === (location as { player: PlayerId }).player
      : at.id === (location as { id: ObjectId }).id
  })
}

/** Total Power of one Domain available to a player, universal Power aside. */
export function powerOf(pool: RunePool, domain: Domain): number {
  return pool.power[domain] ?? 0
}
