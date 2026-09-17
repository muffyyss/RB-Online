import { describe, expect, it } from 'vitest'

import { advanceFlow, legalActions, pointsToWin } from '@rb/engine'
import type { GameState, Location, PlayerId } from '@rb/engine'

import { PLAIN_BATTLEFIELD, act, base, field, mainPhase, oracle, settle } from './support/game.js'
import { fightOut } from './support/combat.js'
import type { Spec } from './support/game.js'

/**
 * The Battlefield Zone of Origins (107.2).
 *
 * Every Battlefield in the set is authored, because a deck of any Legend draws
 * its three from the same 24 — so the ones a match puts on the table are no
 * longer only the four the Proving Grounds decks bring. The ones whose text the
 * DSL cannot express yet carry `notImplemented` and are listed by card-lint;
 * the rest are played here through `applyAction`, as a match plays them.
 */

/** Player 0's Scoring Step, holding bf-0, which is `card`. */
function holding(card: string, specs: readonly Spec[] = []): GameState {
  const start = mainPhase(
    [{ id: 'guard', cardId: 'OGN-219', owner: 0, at: field('bf-0') }, ...specs],
    [card, PLAIN_BATTLEFIELD],
  )
  return {
    ...start,
    battlefields: start.battlefields.map((bf) =>
      bf.id === 'bf-0' ? { ...bf, controller: 0 as const } : bf,
    ),
    phase: 'beginning',
    step: 'scoring',
    stepTaskDone: false,
    priority: null,
  }
}

/** Walk one unit into an empty, uncontrolled bf-0 — which Conquers it (469.1). */
function conquer(card: string, specs: readonly Spec[] = []): GameState {
  const start = mainPhase(
    [{ id: 'raider', cardId: 'OGN-219', owner: 0, at: base(0) }, ...specs],
    [card, PLAIN_BATTLEFIELD],
  )
  return settle(act(start, { type: 'move', player: 0, units: ['raider'], to: field('bf-0') }))
}

const movesOf = (state: GameState, player: PlayerId, unit: string): readonly Location[] =>
  legalActions(state, player, oracle)
    .filter((action) => action.type === 'move' && action.units.includes(unit))
    .map((action) => (action.type === 'move' ? action.to : base(player)))

describe('OGN Battlefields — what they do when you hold or conquer them', () => {
  it('OGN-275 Altar to Unity plays a Recruit token in your base when you hold here', () => {
    const after = settle(advanceFlow(holding('OGN-275'), oracle).state)
    const recruits = Object.values(after.objects).filter((object) => object.cardId === 'TOK-001')
    expect(recruits).toHaveLength(1)
    expect(recruits[0]).toMatchObject({ controller: 0, zone: 'base' })
    expect(after.players[0].base).toContain(recruits[0]?.id)
  })

  it('OGN-280 Grove of the God-Willow draws you a card when you hold here', () => {
    // The turn runs on into its own Draw Step either way, so the Grove's card
    // is the difference between holding it and holding a plain Battlefield.
    const drawn = (battlefield: string) => {
      const before = holding(battlefield)
      const after = settle(advanceFlow(before, oracle).state)
      return after.players[0].hand.length - before.players[0].hand.length
    }
    expect(drawn('OGN-280')).toBe(drawn(PLAIN_BATTLEFIELD) + 1)
  })

  it('OGN-283 Navori Fighting Pit buffs a unit here when you hold here', () => {
    const start = holding('OGN-283', [
      { id: 'theirs', cardId: 'OGN-219', owner: 1, at: field('bf-0') },
    ])
    const held = advanceFlow(start, oracle).state
    // "A unit here" is either player's, so both are candidates.
    let asking = held
    while (!asking.pendingChoice) {
      asking = act(asking, { type: 'pass', player: asking.priority ?? 0 })
    }
    expect(asking.pendingChoice?.candidates).toEqual(expect.arrayContaining(['guard', 'theirs']))
    const after = settle(asking, () => ['theirs'])
    expect(after.objects.theirs?.buffs).toBe(1)
    expect(after.objects.guard?.buffs).toBe(0)
  })

  it('OGN-287 Sigil of the Storm recycles one of your runes when you conquer here', () => {
    const after = conquer('OGN-287', [{ id: 'rune-a', cardId: 'OGN-126', owner: 0, at: base(0) }])
    expect(after.objects['rune-a']?.zone).toBe('runeDeck')
    expect(after.players[0].runeDeck).toContain('rune-a')
    expect(after.players[0].base).not.toContain('rune-a')
  })

  it('OGN-298 Zaun Warrens discards a card and draws one when you conquer here', () => {
    const start = mainPhase(
      [
        { id: 'raider', cardId: 'OGN-219', owner: 0, at: base(0) },
        { id: 'spare', cardId: 'OGN-219', owner: 0, at: 'hand' },
      ],
      ['OGN-298', PLAIN_BATTLEFIELD],
    )
    const after = settle(
      act(start, { type: 'move', player: 0, units: ['raider'], to: field('bf-0') }),
      () => ['spare'],
    )
    expect(after.objects.spare?.zone).toBe('trash')
    // One out, one in: the hand is the same size, with a different card in it.
    expect(after.players[0].hand).toHaveLength(start.players[0].hand.length)
    expect(after.players[0].hand).not.toContain('spare')
  })

  it('hands Priority back after a Move that fired a Conquer trigger', () => {
    // The Sigil asks for a rune to recycle and there is none, so the trigger
    // resolves doing nothing. The turn still has to come back to the player who
    // moved: their Main Phase is not over (315.3).
    const after = conquer('OGN-287')
    expect(after.chain).toHaveLength(0)
    expect(after.pendingChoice).toBeNull()
    expect(after.winner).toBeNull()
    expect(after.priority).toBe(0)
    expect(legalActions(after, 0, oracle).length).toBeGreaterThan(0)
  })

  it('OGN-293 The Grand Plaza wins the game for seven units here, and not for six', () => {
    const army = (count: number): Spec[] =>
      Array.from({ length: count }, (_, i) => ({
        id: `soldier-${String(i)}`,
        cardId: 'OGN-219',
        owner: 0 as const,
        at: field('bf-0'),
      }))
    // `holding` already stands one unit there, so six more make seven.
    expect(settle(advanceFlow(holding('OGN-293', army(6)), oracle).state).winner).toBe(0)
    const five = settle(advanceFlow(holding('OGN-293', army(5)), oracle).state)
    expect(five.winner).toBeNull()
  })

  it('OGN-285 Reaver’s Row lets you pull a unit back to base when you defend here', () => {
    const start = mainPhase(
      [
        { id: 'defender', cardId: 'OGN-088', owner: 0, at: field('bf-0') }, // 8 Might
        { id: 'attacker', cardId: 'OGN-219', owner: 1, at: base(1) },
      ],
      ['OGN-285', PLAIN_BATTLEFIELD],
    )
    // Player 0 controls it, so the unit walking in is the Attacker (464.2.c.1)
    // and the trigger belongs to the player holding the Row.
    const theirTurn: GameState = {
      ...start,
      battlefields: start.battlefields.map((bf) =>
        bf.id === 'bf-0' ? { ...bf, controller: 0 as const } : bf,
      ),
      turnPlayer: 1,
      priority: 1,
    }
    const after = fightOut(
      act(theirTurn, { type: 'move', player: 1, units: ['attacker'], to: field('bf-0') }),
    )
    // The trigger asked, the answer was yes, and the defender went home — so it
    // was not there for the Combat, and the attacker took the Battlefield.
    expect(after.objects.defender).toMatchObject({ zone: 'base', location: base(0) })
    expect(after.battlefields.find((bf) => bf.id === 'bf-0')?.controller).toBe(1)
  })
})

describe('OGN Battlefields — the ones that change the rules while they sit there', () => {
  it('OGN-295 Vilemaw’s Lair stops units there from moving to base, by any means', () => {
    const start = mainPhase(
      [
        { id: 'trapped', cardId: 'OGN-219', owner: 0, at: field('bf-0') },
        { id: 'free', cardId: 'OGN-219', owner: 0, at: field('bf-1') },
        { id: 'marauder', cardId: 'OGN-191', owner: 0, at: 'hand' }, // "move a unit ... to its base"
      ],
      ['OGN-295', PLAIN_BATTLEFIELD],
    )
    expect(movesOf(start, 0, 'trapped')).toEqual([])
    expect(movesOf(start, 0, 'free')).toEqual(expect.arrayContaining([base(0)]))

    // And an effect's Move is a Move too (420.1): the Marauder cannot pull it out.
    const played = settle(act(start, { type: 'play-card', player: 0, card: 'marauder' }), () => [
      'trapped',
    ])
    expect(played.objects.trapped?.location).toEqual(field('bf-0'))
  })

  it('OGN-297 Windswept Hillock gives units there Ganking', () => {
    const start = mainPhase(
      [
        { id: 'roamer', cardId: 'OGN-219', owner: 0, at: field('bf-0') },
        { id: 'homebody', cardId: 'OGN-219', owner: 0, at: field('bf-1') },
      ],
      ['OGN-297', PLAIN_BATTLEFIELD],
    )
    // Battlefield to Battlefield takes Ganking (144.4.c.1); only one has it.
    expect(movesOf(start, 0, 'roamer')).toEqual(expect.arrayContaining([field('bf-1'), base(0)]))
    expect(movesOf(start, 0, 'homebody')).toEqual([base(0)])
  })

  it('OGN-276 Aspirant’s Climb puts the game out of reach at eight points', () => {
    const atEight = (battlefield: string): GameState => {
      const start = mainPhase([], [battlefield, PLAIN_BATTLEFIELD])
      return {
        ...start,
        players: { ...start.players, 0: { ...start.players[0], points: 8 } },
        phase: 'ending',
        step: 'ending',
        stepTaskDone: false,
        priority: null,
      }
    }
    expect(pointsToWin(atEight('OGN-276'), oracle, 8)).toBe(9)
    expect(advanceFlow(atEight('OGN-276'), oracle).state.winner).toBeNull()
    // The same board without it: eight points is the game.
    expect(advanceFlow(atEight(PLAIN_BATTLEFIELD), oracle).state.winner).toBe(0)
  })
})
