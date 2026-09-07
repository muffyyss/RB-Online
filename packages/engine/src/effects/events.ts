/**
 * Events — what the engine says happened.
 *
 * Applying an action returns the next state plus an ordered event list. Events
 * are what the client animates and what golden replay tests diff against, so
 * they describe observable outcomes rather than internal bookkeeping: "this unit
 * took 2 damage and died", not "the objects map was rewritten".
 *
 * Events are redacted per recipient before they go on the wire, in the same way
 * state is.
 */

import type { Domain } from '../model/domain.js'
import type { Location, ObjectId, PlayerId } from '../state/game-state.js'

export type GameEvent =
  // --- units ---
  | { readonly type: 'damage-dealt'; readonly target: ObjectId; readonly amount: number }
  | { readonly type: 'healed'; readonly target: ObjectId }
  | { readonly type: 'killed'; readonly target: ObjectId }
  | { readonly type: 'banished'; readonly target: ObjectId }
  | { readonly type: 'buffed'; readonly target: ObjectId; readonly amount: number }
  | { readonly type: 'stunned'; readonly target: ObjectId }
  | { readonly type: 'exhausted'; readonly target: ObjectId }
  | { readonly type: 'readied'; readonly target: ObjectId }

  // --- cards and resources ---
  | { readonly type: 'drew'; readonly player: PlayerId; readonly cards: readonly ObjectId[] }
  | { readonly type: 'discarded'; readonly player: PlayerId; readonly cards: readonly ObjectId[] }
  | { readonly type: 'recycled'; readonly player: PlayerId; readonly cards: readonly ObjectId[] }
  | { readonly type: 'channeled'; readonly player: PlayerId; readonly runes: readonly ObjectId[] }
  | {
      readonly type: 'resources-added'
      readonly player: PlayerId
      readonly energy: number
      readonly power: readonly Domain[]
      readonly universal: number
    }

  // --- board ---
  | { readonly type: 'moved'; readonly unit: ObjectId; readonly to: Location }
  | {
      readonly type: 'battlefield-controlled'
      readonly battlefield: ObjectId
      readonly player: PlayerId
    }
  | { readonly type: 'battlefield-uncontrolled'; readonly battlefield: ObjectId }
  | { readonly type: 'recalled'; readonly unit: ObjectId }

  // --- combat ---
  | {
      readonly type: 'combat-began'
      readonly battlefield: ObjectId
      readonly attacker: PlayerId
      readonly defender: PlayerId
    }
  | {
      readonly type: 'combat-ended'
      readonly battlefield: ObjectId
      readonly result: 'attacker' | 'defender' | 'none'
    }

  // --- scoring and endgame ---
  | { readonly type: 'points-gained'; readonly player: PlayerId; readonly amount: number }
  | { readonly type: 'burned-out'; readonly player: PlayerId; readonly gavePointTo: PlayerId }
  | { readonly type: 'game-won'; readonly player: PlayerId }

  // --- flow ---
  | { readonly type: 'choice-required'; readonly player: PlayerId; readonly binding: string }
  | {
      readonly type: 'effect-skipped'
      readonly reason: 'no-targets' | 'declined' | 'not-implemented'
      readonly detail?: string
    }
