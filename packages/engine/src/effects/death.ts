/**
 * Deaths that do not happen.
 *
 * "The next time it dies this turn, recall it exhausted instead" replaces the
 * death (438, 370): the unit never goes to the trash, and nothing that watches
 * for dying sees one (370.1.b). Every place a unit can die asks here first.
 */

import type { GameEvent } from './events.js'
import type { GameState, ObjectId } from '../state/game-state.js'

/**
 * If this unit's death is to be replaced, the state with it recalled instead:
 * sent to its controller's Base (a Recall is not a Move, 456), exhausted, and
 * no longer in the combat. Its damage stays (458.1). Null if it dies.
 */
export function replaceDeath(
  state: GameState,
  id: ObjectId,
  events: GameEvent[],
): GameState | null {
  const object = state.objects[id]
  if (!object?.recallInsteadOfDying) return null
  // 370.2 - applied once: the replacement is used up.
  const { recallInsteadOfDying: _used, combatRole: _role, ...rest } = object
  events.push({ type: 'recalled', unit: id })
  return {
    ...state,
    objects: {
      ...state.objects,
      [id]: {
        ...rest,
        zone: 'base',
        location: { kind: 'base', player: object.controller },
        exhausted: true,
      },
    },
  }
}
