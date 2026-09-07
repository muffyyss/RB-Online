import { describe, expect, it } from 'vitest'

import { applyAction } from '../src/actions/index.js'
import { oracleFrom } from '../src/effects/oracle.js'
import { settleBoard } from '../src/flow/cleanup.js'
import { resolveCombatEnd } from '../src/flow/combat.js'
import type { GameEvent } from '../src/effects/events.js'
import type { GameState, Location, PlayerId } from '../src/state/game-state.js'
import { makeState } from './support/state.js'

const oracle = oracleFrom({
  m1: {
    type: 'unit',
    name: 'Scout',
    domains: ['fury'],
    tags: [],
    might: 1,
    keywords: [],
    abilities: [],
  },
  m2: {
    type: 'unit',
    name: 'Guard',
    domains: ['fury'],
    tags: [],
    might: 2,
    keywords: [],
    abilities: [],
  },
  m3: {
    type: 'unit',
    name: 'Knight',
    domains: ['fury'],
    tags: [],
    might: 3,
    keywords: [],
    abilities: [],
  },
  m5: {
    type: 'unit',
    name: 'Titan',
    domains: ['fury'],
    tags: [],
    might: 5,
    keywords: [],
    abilities: [],
  },
})

const BF: Location = { kind: 'battlefield', id: 'bf-0' }

interface UnitSpec {
  readonly id: string
  readonly owner: PlayerId
  readonly card: 'm1' | 'm2' | 'm3' | 'm5'
}

/** Two sides already facing each other at bf-0, contested by `contestedBy`. */
function facingOff(
  units: readonly UnitSpec[],
  contestedBy: PlayerId = 0,
  controller?: PlayerId,
): GameState {
  const state = makeState(
    units.map((u) => ({ id: u.id, cardId: u.card, owner: u.owner, zone: 'battlefield' as const })),
    {
      phase: 'main',
      step: 'main',
      turnPlayer: 0,
      priority: 0,
      battlefields: [
        {
          id: 'bf-0',
          contested: true,
          contestedBy,
          facedown: [],
          ...(controller === undefined ? {} : { controller }),
        },
        { id: 'bf-1', contested: false, facedown: [] },
      ],
    },
  )
  const objects = { ...state.objects }
  for (const u of units) {
    const object = objects[u.id]
    if (object) objects[u.id] = { ...object, location: BF }
  }
  return { ...state, objects }
}

/** Start the combat, then have both players pass to close the showdown. */
function fight(state: GameState): { state: GameState; events: readonly GameEvent[] } {
  const events: GameEvent[] = []
  const opened = settleBoard(state, oracle, events)
  expect(opened.showdown).toBeDefined()

  const first = applyAction(opened, { type: 'pass', player: opened.priority as PlayerId }, oracle)
  if (!first.ok) throw new Error('first pass rejected')
  const second = applyAction(
    first.state,
    { type: 'pass', player: first.state.priority as PlayerId },
    oracle,
  )
  if (!second.ok) throw new Error('second pass rejected')
  return { state: second.state, events: [...events, ...first.events, ...second.events] }
}

describe('opening a combat (460, 464)', () => {
  it('makes the player who contested the battlefield the Attacker (464.2.c.1)', () => {
    const events: GameEvent[] = []
    // Player 1 contested, even though player 0 is the Turn Player.
    const opened = settleBoard(
      facingOff(
        [
          { id: 'a', owner: 0, card: 'm2' },
          { id: 'b', owner: 1, card: 'm2' },
        ],
        1,
      ),
      oracle,
      events,
    )
    expect(opened.showdown?.attacker).toBe(1)
    expect(opened.showdown?.defender).toBe(0)
    // The Attacker gains Focus, and Focus carries Priority (313.2, 464.2.d).
    expect(opened.focus).toBe(1)
    expect(opened.priority).toBe(1)
  })

  it('tags every unit present with its combat role (464.2.c.3)', () => {
    const events: GameEvent[] = []
    const opened = settleBoard(
      facingOff([
        { id: 'a', owner: 0, card: 'm2' },
        { id: 'b', owner: 1, card: 'm2' },
      ]),
      oracle,
      events,
    )
    expect(opened.objects.a?.combatRole).toBe('attacker')
    expect(opened.objects.b?.combatRole).toBe('defender')
  })

  it('puts the turn into a Showdown State (308.1)', () => {
    const events: GameEvent[] = []
    const opened = settleBoard(
      facingOff([
        { id: 'a', owner: 0, card: 'm2' },
        { id: 'b', owner: 1, card: 'm2' },
      ]),
      oracle,
      events,
    )
    expect(opened.showdown?.combat).toBe(true)
  })
})

describe('the Combat Damage Step (465)', () => {
  it('trades evenly matched units — both die', () => {
    const { state } = fight(
      facingOff([
        { id: 'a', owner: 0, card: 'm2' },
        { id: 'b', owner: 1, card: 'm2' },
      ]),
    )
    expect(state.objects.a?.zone).toBe('trash')
    expect(state.objects.b?.zone).toBe('trash')
  })

  it('lets a bigger unit survive a smaller one', () => {
    const { state } = fight(
      facingOff([
        { id: 'big', owner: 0, card: 'm3' },
        { id: 'small', owner: 1, card: 'm1' },
      ]),
    )
    expect(state.objects.small?.zone).toBe('trash')
    expect(state.objects.big?.zone).toBe('battlefield')
  })

  it('deals damage simultaneously — a dying unit still deals its Might (465.2.c.1)', () => {
    // 2 Might each: both assign 2, both die. If damage were dealt in sequence
    // the first to die would deal nothing.
    const { state, events } = fight(
      facingOff([
        { id: 'a', owner: 0, card: 'm2' },
        { id: 'b', owner: 1, card: 'm2' },
      ]),
    )
    expect(events.filter((e) => e.type === 'killed')).toHaveLength(2)
    expect(state.objects.a?.zone).toBe('trash')
  })

  it('sums Might across a side (465.2.a)', () => {
    // Two 1-Might attackers total 2, enough to kill one 2-Might defender.
    const { state } = fight(
      facingOff([
        { id: 'a1', owner: 0, card: 'm1' },
        { id: 'a2', owner: 0, card: 'm1' },
        { id: 'd', owner: 1, card: 'm2' },
      ]),
    )
    expect(state.objects.d?.zone).toBe('trash')
  })

  it('heals survivors at the end of combat (466.1.a.1)', () => {
    // 5 Might vs 3 Might: the Titan takes 3 but lives, and is healed.
    const { state } = fight(
      facingOff([
        { id: 'titan', owner: 0, card: 'm5' },
        { id: 'knight', owner: 1, card: 'm3' },
      ]),
    )
    expect(state.objects.titan?.zone).toBe('battlefield')
    expect(state.objects.titan?.damage).toBe(0)
  })
})

describe('the Resolution Step (466)', () => {
  it('gives the winner Control, and that is a Conquer (466.5.d)', () => {
    const { state } = fight(
      facingOff([
        { id: 'big', owner: 0, card: 'm3' },
        { id: 'small', owner: 1, card: 'm1' },
      ]),
    )
    expect(state.battlefields[0]?.controller).toBe(0)
    expect(state.players[0].points).toBe(1)
    expect(state.battlefields[0]?.contested).toBe(false)
  })

  it('recalls surviving attackers when defenders hold the field (466.1.a.2)', () => {
    // Note: with vanilla stats both sides surviving is impossible, because a
    // unit's Might equals its own lethal threshold - whichever side has more
    // Might always clears the other. Recall therefore only fires once damage
    // prevention, Shield, or mid-combat arrivals exist. The rule is tested
    // directly instead of through a combat that cannot produce it.
    const board = facingOff([
      { id: 'atk', owner: 0, card: 'm2' },
      { id: 'def', owner: 1, card: 'm2' },
    ])
    const events: GameEvent[] = []
    const inCombat: GameState = {
      ...board,
      showdown: { battlefield: 'bf-0', combat: true, attacker: 0, defender: 1 },
    }
    const after = resolveCombatEnd(inCombat, oracle, events)

    expect(after.objects.atk?.zone).toBe('base')
    expect(after.objects.def?.zone).toBe('battlefield')
    expect(events).toContainEqual({ type: 'recalled', unit: 'atk' })
    // Nobody won, so Control does not change (466.3.d).
    expect(events).toContainEqual({
      type: 'combat-ended',
      battlefield: 'bf-0',
      result: 'none',
    })
  })

  it('leaves the battlefield Uncontrolled when everyone dies (466.5.b)', () => {
    const { state } = fight(
      facingOff(
        [
          { id: 'a', owner: 0, card: 'm2' },
          { id: 'b', owner: 1, card: 'm2' },
        ],
        0,
        1,
      ),
    )
    expect(state.battlefields[0]?.controller).toBeUndefined()
  })

  it('clears combat roles and closes the showdown (466.7)', () => {
    const { state } = fight(
      facingOff([
        { id: 'big', owner: 0, card: 'm3' },
        { id: 'small', owner: 1, card: 'm1' },
      ]),
    )
    expect(state.showdown).toBeUndefined()
    expect(state.objects.big?.combatRole).toBeUndefined()
    expect(state.focus).toBeNull()
  })

  it('reports the result', () => {
    const { events } = fight(
      facingOff([
        { id: 'big', owner: 0, card: 'm3' },
        { id: 'small', owner: 1, card: 'm1' },
      ]),
    )
    expect(events).toContainEqual({
      type: 'combat-ended',
      battlefield: 'bf-0',
      result: 'attacker',
    })
  })
})

describe('combat restricts what can be done', () => {
  it('blocks a Standard Move during a Showdown (144.1.c)', () => {
    const events: GameEvent[] = []
    const opened = settleBoard(
      facingOff([
        { id: 'a', owner: 0, card: 'm2' },
        { id: 'b', owner: 1, card: 'm2' },
      ]),
      oracle,
      events,
    )
    const state: GameState = {
      ...opened,
      objects: {
        ...opened.objects,
        spare: {
          id: 'spare',
          cardId: 'm2',
          owner: 0,
          controller: 0,
          zone: 'base',
          location: { kind: 'base', player: 0 },
          exhausted: false,
          damage: 0,
          buffs: 0,
          faceDown: false,
        },
      },
    }
    const result = applyAction(state, { type: 'move', player: 0, units: ['spare'], to: BF }, oracle)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.message).toBe('showdown-in-progress')
  })

  it('takes two passes to close the showdown, not one', () => {
    const events: GameEvent[] = []
    const opened = settleBoard(
      facingOff([
        { id: 'a', owner: 0, card: 'm2' },
        { id: 'b', owner: 1, card: 'm2' },
      ]),
      oracle,
      events,
    )
    const first = applyAction(opened, { type: 'pass', player: 0 }, oracle)
    if (!first.ok) throw new Error('rejected')
    // Still in combat; the defender gets their window.
    expect(first.state.showdown).toBeDefined()
    expect(first.state.priority).toBe(1)
  })
})
