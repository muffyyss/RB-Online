/**
 * Cleanups (318-320) — the bookkeeping that runs between everything else.
 *
 * A Cleanup becomes an Outstanding Task after a great many events (319):
 * state transitions, phase changes, Chain items appearing or leaving, objects
 * entering or leaving the Board, any status change, and after a Move completes.
 * Rather than call it from each of those, callers run it whenever they have
 * changed the board and let it work out what follows.
 *
 * This is where Battlefield Control is settled (190.4) and therefore where
 * Conquer scoring happens (469.1) — control changing hands *is* the Conquer.
 */

import type { GameEvent } from '../effects/events.js'
import type { CardOracle } from '../effects/oracle.js'
import { beginCombat } from './combat.js'
import { score } from './phases.js'
import type { BattlefieldState, GameState, ObjectId, PlayerId } from '../state/game-state.js'

/** Which players have units at a Battlefield right now. */
function occupants(state: GameState, battlefieldId: ObjectId): Set<PlayerId> {
  const players = new Set<PlayerId>()
  for (const object of Object.values(state.objects)) {
    if (object.zone !== 'battlefield') continue
    if (object.location?.kind !== 'battlefield') continue
    if (object.location.id !== battlefieldId) continue
    players.add(object.controller)
  }
  return players
}

/**
 * Apply Contested status where a unit has arrived somewhere it does not control
 * (190.3.a.1, 450).
 *
 * Called as part of a Cleanup rather than by the move itself, so a unit arriving
 * by any means — moved, played, or put there by an effect — is treated alike.
 */
function applyContested(state: GameState): GameState {
  const battlefields = state.battlefields.map((bf) => {
    if (bf.contested) return bf
    const here = occupants(state, bf.id)
    const intruder = [...here].find((player) => player !== bf.controller)
    // Record who contested it: the Attacker in any resulting Combat is the
    // player whose units applied the status (464.2.c.1), not the Turn Player.
    return intruder === undefined ? bf : { ...bf, contested: true, contestedBy: intruder }
  })
  return { ...state, battlefields }
}

/**
 * Settle Control (190.4) and score any Conquer that results (469.1).
 *
 * Three cases matter:
 *
 *  - One player alone holds a Battlefield they did not control: they establish
 *    Control, which is a Conquer if they have not Scored it this turn (466.5.d).
 *  - A controller with no units left loses Control in this Cleanup (190.4.c).
 *  - Two players present means a Combat is staged (461); Control cannot change
 *    while that is pending (190.4.b), so this leaves it alone.
 */
function settleControl(state: GameState, events: GameEvent[]): GameState {
  let current = state
  const battlefields: BattlefieldState[] = []

  for (const bf of current.battlefields) {
    const here = occupants(current, bf.id)

    // 190.4.b - Control cannot change while a Combat or Showdown is ongoing.
    if (current.showdown?.battlefield === bf.id) {
      battlefields.push(bf)
      continue
    }

    // Opposing units present: a Combat is staged and Control waits for it (461).
    if (here.size > 1) {
      battlefields.push({ ...bf, contested: true })
      continue
    }

    if (here.size === 1) {
      const holder = [...here][0] as PlayerId
      if (bf.controller === holder) {
        // 190.4.a - they keep Control while they have units there.
        battlefields.push({ ...bf, contested: false })
        continue
      }
      // Control established. That is a Conquer (466.5.d, 469.1).
      current = score(current, holder, bf.id, 'conquer', events)
      events.push({ type: 'battlefield-controlled', battlefield: bf.id, player: holder })
      battlefields.push({ ...bf, controller: holder, contested: false })
      continue
    }

    // 190.4.c - nobody here, so a controller loses Control in this Cleanup.
    // 466.5.b - a Battlefield with no units becomes Uncontrolled.
    if (bf.controller !== undefined) {
      events.push({ type: 'battlefield-uncontrolled', battlefield: bf.id })
      const { controller: _controller, ...rest } = bf
      battlefields.push({ ...rest, contested: false })
      continue
    }
    battlefields.push({ ...bf, contested: false })
  }

  return { ...current, battlefields }
}

/**
 * Run a Cleanup.
 *
 * Contested is applied before Control is settled, because whether a Battlefield
 * is Contested decides whether Control may change at all.
 */
export function runCleanup(state: GameState, events: GameEvent[]): GameState {
  return settleControl(applyContested(state), events)
}

/**
 * Battlefields where opposing units are present but combat has not begun (461).
 *
 * The Turn Player chooses which to resolve first when there is more than one
 * (461.1).
 */
export function stagedCombats(state: GameState): readonly ObjectId[] {
  return state.battlefields.filter((bf) => occupants(state, bf.id).size > 1).map((bf) => bf.id)
}

/**
 * Run a Cleanup and start a Combat if one is now staged.
 *
 * 460 - a Combat begins when a Cleanup occurs, the Chain is empty, a Combat is
 * staged, and no Showdown or Combat is ongoing anywhere else. Callers use this
 * rather than `runCleanup` whenever they have changed the board, so units
 * meeting at a Battlefield always lead somewhere.
 *
 * With more than one staged Combat the Turn Player chooses which to resolve
 * first (461.1); with two Battlefields in a Duel that choice is rare, and the
 * first is taken for determinism until it is worth surfacing.
 */
export function settleBoard(state: GameState, oracle: CardOracle, events: GameEvent[]): GameState {
  const cleaned = runCleanup(state, events)
  if (cleaned.showdown || cleaned.chain.length > 0 || cleaned.winner !== null) return cleaned

  const staged = stagedCombats(cleaned)
  const first = staged[0]
  return first === undefined ? cleaned : beginCombat(cleaned, first, events)
}
