/**
 * Combat (459-466).
 *
 * Three steps, and the shape of them matters:
 *
 *  1. **Combat Showdown** (464) — Attacker and Defender are established, the
 *     Attacker gains Focus, and both players get a window to play Action and
 *     Reaction cards.
 *  2. **Combat Damage** (465) — each side assigns damage equal to its summed
 *     Might among the other's units, then all of it is dealt at once. This step
 *     explicitly **skips FEPR and cancels outstanding tasks** (465.3): there is
 *     no window between damage and resolution.
 *  3. **Resolution** (466) — heal, recall, decide the result, establish Control.
 *
 * The Attacker is the player whose units applied Contested (464.2.c.1) — which
 * is usually but not always the Turn Player.
 */

import type { GameEvent } from '../effects/events.js'
import type { CardOracle } from '../effects/oracle.js'
import { assignDamage, sumMight } from './damage.js'
import type { DamageTarget } from './damage.js'
import { score } from './phases.js'
import type {
  BattlefieldState,
  GameObject,
  GameState,
  ObjectId,
  PlayerId,
} from '../state/game-state.js'
import { opponentOf } from '../state/game-state.js'

/** Units on the board at a Battlefield, controlled by a given player. */
function unitsAt(
  state: GameState,
  oracle: CardOracle,
  battlefieldId: ObjectId,
  player: PlayerId,
): readonly GameObject[] {
  return Object.values(state.objects).filter((object) => {
    if (object.zone !== 'battlefield') return false
    if (object.location?.kind !== 'battlefield') return false
    if (object.location.id !== battlefieldId) return false
    if (object.controller !== player) return false
    return oracle.facts(object.cardId)?.type === 'unit'
  })
}

function toTarget(object: GameObject, oracle: CardOracle): DamageTarget {
  // Buffs each add +1 Might (703). Full layer application arrives with the
  // continuous-effect system; printed plus buffs is right for now.
  const printed = oracle.facts(object.cardId)?.might ?? 0
  return { id: object.id, might: printed + object.buffs, damage: object.damage }
}

function battlefieldById(state: GameState, id: ObjectId): BattlefieldState | undefined {
  return state.battlefields.find((bf) => bf.id === id)
}

/**
 * Open a Combat at a staged Battlefield (460, 464).
 *
 * The Attacker gains Focus, and with it Priority (313.2), so the window belongs
 * to them first.
 */
export function beginCombat(
  state: GameState,
  battlefieldId: ObjectId,
  events: GameEvent[],
): GameState {
  const bf = battlefieldById(state, battlefieldId)
  if (!bf) return state

  // 464.2.c.1 - the Attacker applied Contested. Fall back to the Turn Player
  // if that was never recorded, which can only happen for a pre-set position.
  const attacker = bf.contestedBy ?? state.turnPlayer
  const defender = opponentOf(attacker)

  const objects = { ...state.objects }
  for (const [id, object] of Object.entries(state.objects)) {
    if (object.location?.kind !== 'battlefield') continue
    if (object.location.id !== battlefieldId) continue
    objects[id] = {
      ...object,
      combatRole: object.controller === attacker ? 'attacker' : 'defender',
    }
  }

  events.push({ type: 'combat-began', battlefield: battlefieldId, attacker, defender })
  return {
    ...state,
    objects,
    showdown: { battlefield: battlefieldId, combat: true, attacker, defender },
    // 464.2.d / 313.2 - the Attacker gains Focus, and Focus carries Priority.
    focus: attacker,
    priority: attacker,
    consecutivePasses: 0,
  }
}

/**
 * The Combat Damage Step (465).
 *
 * Both sides assign simultaneously — the Attacker first, but neither
 * assignment sees the other's result, because assigning is not dealing
 * (465.2.c.1). Only once everything is assigned is damage dealt.
 */
export function resolveCombatDamage(
  state: GameState,
  oracle: CardOracle,
  events: GameEvent[],
): GameState {
  const showdown = state.showdown
  if (!showdown?.combat || showdown.attacker === undefined || showdown.defender === undefined) {
    return state
  }
  const { battlefield, attacker, defender } = showdown

  const attackers = unitsAt(state, oracle, battlefield, attacker)
  const defenders = unitsAt(state, oracle, battlefield, defender)

  // 465.1 - damage happens only if both sides still have units here.
  if (attackers.length === 0 || defenders.length === 0) return state

  const attackTargets = defenders.map((u) => toTarget(u, oracle))
  const defendTargets = attackers.map((u) => toTarget(u, oracle))

  const ontoDefenders = assignDamage(sumMight(defendTargets), attackTargets)
  const ontoAttackers = assignDamage(sumMight(attackTargets), defendTargets)

  // Deal everything at once (465.2.c.1.a, 465.2.d).
  const objects = { ...state.objects }
  for (const [id, amount] of [...ontoDefenders, ...ontoAttackers]) {
    const object = objects[id]
    if (!object || amount <= 0) continue
    objects[id] = { ...object, damage: object.damage + amount }
    events.push({ type: 'damage-dealt', target: id, amount })
  }

  // Then kill everything that took lethal damage (143.2.a).
  let next: GameState = { ...state, objects }
  for (const id of [...ontoDefenders.keys(), ...ontoAttackers.keys()]) {
    const object = next.objects[id]
    if (!object) continue
    const might = (oracle.facts(object.cardId)?.might ?? 0) + object.buffs
    if (object.damage > 0 && object.damage >= Math.max(0, might)) {
      next = killUnit(next, id, events)
    }
  }
  return next
}

/** Move a dead unit to its owner's trash, clearing its board state (705). */
function killUnit(state: GameState, id: ObjectId, events: GameEvent[]): GameState {
  const object = state.objects[id]
  if (!object) return state
  const owner = state.players[object.owner]
  events.push({ type: 'killed', target: id })
  return {
    ...state,
    objects: {
      ...state.objects,
      [id]: {
        id: object.id,
        cardId: object.cardId,
        owner: object.owner,
        controller: object.owner,
        zone: 'trash',
        exhausted: false,
        damage: 0,
        buffs: 0,
        faceDown: false,
      },
    },
    players: {
      ...state.players,
      [object.owner]: { ...owner, trash: [id, ...owner.trash] },
    },
  }
}

/** Send a unit back to its controller's Base. A Recall is not a Move (456). */
function recall(state: GameState, id: ObjectId, events: GameEvent[]): GameState {
  const object = state.objects[id]
  if (!object) return state
  events.push({ type: 'recalled', unit: id })
  return {
    ...state,
    objects: {
      ...state.objects,
      [id]: {
        ...object,
        zone: 'base',
        location: { kind: 'base', player: object.controller },
      },
    },
  }
}

export type CombatResult = 'attacker' | 'defender' | 'none'

/**
 * The Resolution Step (466).
 *
 * The Combat Cleanup heals every unit and recalls surviving Attackers if any
 * Defender is still present (466.1.a) — so an attack that fails to clear the
 * Battlefield sends the attackers home rather than leaving them there.
 */
export function resolveCombatEnd(
  state: GameState,
  oracle: CardOracle,
  events: GameEvent[],
): GameState {
  const showdown = state.showdown
  if (!showdown?.combat || showdown.attacker === undefined || showdown.defender === undefined) {
    return state
  }
  const { battlefield, attacker, defender } = showdown

  // 466.1.a.1 - heal all units.
  const healed = { ...state.objects }
  for (const [id, object] of Object.entries(state.objects)) {
    if (object.damage > 0) healed[id] = { ...object, damage: 0 }
  }
  let next: GameState = { ...state, objects: healed }

  const defendersLeft = unitsAt(next, oracle, battlefield, defender)
  const attackersLeft = unitsAt(next, oracle, battlefield, attacker)

  // 466.1.a.2 - recall Attackers if Defenders are still present.
  let recalled = false
  if (defendersLeft.length > 0 && attackersLeft.length > 0) {
    for (const unit of attackersLeft) next = recall(next, unit.id, events)
    recalled = true
  }

  const attackersNow = unitsAt(next, oracle, battlefield, attacker)
  const defendersNow = unitsAt(next, oracle, battlefield, defender)

  // 466.3 - one side alone remaining wins; anything else is No Result.
  let result: CombatResult = 'none'
  if (!recalled) {
    if (attackersNow.length > 0 && defendersNow.length === 0) result = 'attacker'
    else if (defendersNow.length > 0 && attackersNow.length === 0) result = 'defender'
  }
  events.push({ type: 'combat-ended', battlefield, result })

  // 466.5 - the player with units remaining Establishes Control, which is a
  // Conquer if they have not Scored this Battlefield this turn (466.5.d).
  const battlefields = next.battlefields.map((bf) => {
    if (bf.id !== battlefield) return bf
    const holder =
      attackersNow.length > 0 && defendersNow.length === 0
        ? attacker
        : defendersNow.length > 0 && attackersNow.length === 0
          ? defender
          : undefined

    if (holder === undefined) {
      // Nobody, or both, still here: clear Contested and leave Control as is.
      // 466.5.b - a Battlefield with no units at all becomes Uncontrolled.
      const empty = attackersNow.length === 0 && defendersNow.length === 0
      const { contestedBy: _was, ...rest } = bf
      if (empty && bf.controller !== undefined) {
        const { controller: _controller, ...bare } = rest
        return { ...bare, contested: false }
      }
      return { ...rest, contested: false }
    }
    const { contestedBy: _was, ...rest } = bf
    return { ...rest, controller: holder, contested: false }
  })

  next = { ...next, battlefields }

  const winner = battlefields.find((bf) => bf.id === battlefield)?.controller
  if (
    winner !== undefined &&
    state.battlefields.find((bf) => bf.id === battlefield)?.controller !== winner
  ) {
    next = score(next, winner, battlefield, 'conquer', events)
    events.push({ type: 'battlefield-controlled', battlefield, player: winner })
  }

  // 466.7 - Combat ends: designations are cleared and the Showdown closes.
  const cleared = { ...next.objects }
  for (const [id, object] of Object.entries(next.objects)) {
    if (object.combatRole !== undefined) {
      const { combatRole: _role, ...rest } = object
      cleared[id] = rest
    }
  }

  const { showdown: _showdown, ...withoutShowdown } = next
  return {
    ...withoutShowdown,
    objects: cleared,
    focus: null,
    priority: null,
    consecutivePasses: 0,
  }
}

/**
 * Close the Combat Showdown and run damage then resolution back to back.
 *
 * 465.3 skips FEPR and cancels outstanding tasks between the two, so there is
 * deliberately no window for either player in here.
 */
export function closeCombat(state: GameState, oracle: CardOracle, events: GameEvent[]): GameState {
  return resolveCombatEnd(resolveCombatDamage(state, oracle, events), oracle, events)
}
