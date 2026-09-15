import { describe, expect, it } from 'vitest'

import { applyAction, beginExecution } from '@rb/engine'
import type { GameState } from '@rb/engine'

import { getCard } from '../src/registry.js'
import { OGN_CARDS } from '../src/sets/ogn/index.js'
import { makeState } from '../../engine/test/support/state.js'
import { act, base, field, mainPhase, settle } from './support/game.js'
import { attackInto } from './support/combat.js'
import { board, resolveSpell, testOracle } from './support/play.js'

/**
 * The Origins cards the Proving Grounds decks use.
 *
 * One table instead of forty-five files: most of these are vanilla units, runes
 * and cards whose abilities are recorded but not runnable yet, so what matters is
 * that the printed numbers are right. Cards that do work are tested below
 * against the real interpreter.
 *
 * [id, name, type, domains, energy, power symbols, might]
 */
type Row = [string, string, string, string[], number | null, number, number | null]

const PRINTED: Row[] = [
  ['OGN-005', 'Disintegrate', 'spell', ['fury'], 4, 0, null],
  ['OGN-007', 'Fury Rune', 'rune', ['fury'], null, 0, null],
  ['OGN-013', 'Pouty Poro', 'unit', ['fury'], 2, 0, 2],
  ['OGN-042', 'Calm Rune', 'rune', ['calm'], null, 0, null],
  ['OGN-046', 'En Garde', 'spell', ['calm'], 1, 0, null],
  ['OGN-048', 'Meditation', 'spell', ['calm'], 2, 0, null],
  ['OGN-049', 'Playful Phantom', 'unit', ['calm'], 5, 0, 5],
  ['OGN-052', 'Stalwart Poro', 'unit', ['calm'], 2, 0, 2],
  ['OGN-055', 'Wielder of Water', 'unit', ['calm'], 3, 0, 2],
  ['OGN-084', 'Eager Apprentice', 'unit', ['mind'], 3, 0, 3],
  ['OGN-085', 'Falling Comet', 'spell', ['mind'], 5, 0, null],
  ['OGN-087', 'Lecturing Yordle', 'unit', ['mind'], 3, 0, 2],
  ['OGN-088', 'Mega-Mech', 'unit', ['mind'], 7, 0, 8],
  ['OGN-089', 'Mind Rune', 'rune', ['mind'], null, 0, null],
  ['OGN-095', 'Stupefy', 'spell', ['mind'], 1, 0, null],
  ['OGN-103', 'Ravenbloom Student', 'unit', ['mind'], 2, 0, 2],
  ['OGN-105', 'Singularity', 'spell', ['mind'], 6, 2, null],
  ['OGN-126', 'Body Rune', 'rune', ['body'], null, 0, null],
  ['OGN-127', 'Cannon Barrage', 'spell', ['body'], 2, 1, null],
  ['OGN-129', 'Confront', 'spell', ['body'], 2, 0, null],
  ['OGN-130', 'Crackshot Corsair', 'unit', ['body'], 3, 0, 3],
  ['OGN-131', 'Dune Drake', 'unit', ['body'], 5, 0, 5],
  ['OGN-132', 'First Mate', 'unit', ['body'], 3, 0, 3],
  ['OGN-134', 'Mobilize', 'spell', ['body'], 2, 0, null],
  ['OGN-137', 'Stormclaw Ursine', 'unit', ['body'], 7, 0, 6],
  ['OGN-142', 'Mountain Drake', 'unit', ['body'], 9, 0, 10],
  ['OGN-166', 'Chaos Rune', 'rune', ['chaos'], null, 0, null],
  ['OGN-169', 'Gust', 'spell', ['chaos'], 1, 0, null],
  ['OGN-170', 'Morbid Return', 'spell', ['chaos'], 2, 0, null],
  ['OGN-171', 'Mystic Poro', 'unit', ['chaos'], 2, 0, 2],
  ['OGN-174', 'Sai Scout', 'unit', ['chaos'], 6, 0, 5],
  ['OGN-176', 'Sneaky Deckhand', 'unit', ['chaos'], 3, 0, 2],
  ['OGN-185', 'Traveling Merchant', 'unit', ['chaos'], 2, 0, 2],
  ['OGN-191', 'Maddened Marauder', 'unit', ['chaos'], 5, 0, 4],
  ['OGN-206', 'Back to Back', 'spell', ['order'], 3, 0, null],
  ['OGN-210', 'Daring Poro', 'unit', ['order'], 2, 0, 2],
  ['OGN-211', 'Faithful Manufactor', 'unit', ['order'], 3, 0, 2],
  ['OGN-214', 'Order Rune', 'rune', ['order'], null, 0, null],
  ['OGN-215', 'Petty Officer', 'unit', ['order'], 5, 0, 5],
  ['OGN-219', 'Vanguard Sergeant', 'unit', ['order'], 4, 0, 4],
  ['OGN-222', 'Noxian Drummer', 'unit', ['order'], 3, 0, 3],
  ['OGN-279', 'Fortified Position', 'battlefield', [], null, 0, null],
  ['OGN-288', 'Startipped Peak', 'battlefield', [], null, 0, null],
  ['OGN-294', 'Trifarian War Camp', 'battlefield', [], null, 0, null],
  ['OGN-296', 'Void Gate', 'battlefield', [], null, 0, null],
]

describe('OGN cards used by the Proving Grounds decks', () => {
  it('covers every entered OGN card, and nothing is left out of the table', () => {
    expect(OGN_CARDS.map((c) => c.id).sort()).toEqual(PRINTED.map(([id]) => id).sort())
  })

  it.each(PRINTED)(
    '%s %s matches the printed card',
    (id, name, type, domains, energy, power, might) => {
      const card = getCard(id)
      expect(card).toBeDefined()
      expect(card).toMatchObject({ set: 'ogn', name, type, domains })
      expect(card?.cost?.energy ?? null).toBe(energy)
      expect(card?.cost?.power.length ?? 0).toBe(power)
      expect(card?.might ?? null).toBe(might)
    },
  )

  it('marks every ability the engine cannot run, so none silently does nothing', () => {
    const runnable = new Set([
      'falling-comet-effect',
      'singularity-effect',
      'fury-rune-energy',
      'calm-rune-energy',
      'mind-rune-energy',
      'body-rune-energy',
      'chaos-rune-energy',
      'order-rune-energy',
      'fury-rune-power',
      'calm-rune-power',
      'mind-rune-power',
      'body-rune-power',
      'chaos-rune-power',
      'order-rune-power',
      'lecturing-yordle-draw',
      'crackshot-corsair-shot',
      'first-mate-ready',
      'back-to-back-effect',
      'stupefy-effect',
      'ravenbloom-student-empowered',
      'confront-effect',
      'maddened-marauder-recall',
      'gust-effect',
      'morbid-return-effect',
      'traveling-merchant-trade',
      'stormclaw-ursine-channel',
    ])
    for (const card of OGN_CARDS) {
      for (const ability of card.abilities ?? []) {
        if (runnable.has(ability.id)) expect(ability.notImplemented, ability.id).toBeUndefined()
        else expect(ability.notImplemented, ability.id).toMatch(/\S/)
      }
    }
  })
})

describe('OGN-085 Falling Comet', () => {
  it('deals 6 to a chosen unit at a battlefield', () => {
    const card = getCard('OGN-085')
    if (!card) throw new Error('missing')
    const scene = board([{ id: 'mech', cardId: 'OGN-088', owner: 1, at: 'bf-0' }])
    const result = resolveSpell(card, scene, [['mech']])
    expect(result.state.objects.mech?.damage).toBe(6)
  })
})

describe('OGN-105 Singularity', () => {
  const card = () => {
    const found = getCard('OGN-105')
    if (!found) throw new Error('missing')
    return found
  }
  const scene = () =>
    board([
      { id: 'a', cardId: 'OGN-088', owner: 1, at: 'bf-0' }, // 8 Might
      { id: 'b', cardId: 'OGN-219', owner: 1, at: 'base' }, // 4 Might
      { id: 'c', cardId: 'OGN-049', owner: 0, at: 'bf-1' }, // 5 Might
    ])

  it('deals 6 to each of two chosen units, anywhere on the board', () => {
    const result = resolveSpell(card(), scene(), [['a', 'b']])
    expect(result.state.objects.a?.damage).toBe(6)
    expect(result.state.objects.b?.zone).toBe('trash')
    expect(result.state.objects.c?.damage).toBe(0)
  })

  it('allows choosing just one, or none: "up to two"', () => {
    expect(resolveSpell(card(), scene(), [['c']]).state.objects.c?.zone).toBe('trash')
    const none = resolveSpell(card(), scene(), [[]])
    expect(none.events.filter((e) => e.type === 'damage-dealt')).toHaveLength(0)
  })

  it('offers at most two', () => {
    const effect = card().abilities?.find((a) => a.kind === 'spell')
    const started = beginExecution(
      scene(),
      { source: 'bf-0', controller: 0, steps: effect && 'steps' in effect ? effect.steps : [] },
      testOracle,
    )
    expect(started.state.pendingChoice).toMatchObject({ min: 0, max: 2 })
  })
})

describe('Basic Runes (164.2)', () => {
  function withRune(cardId: string): GameState {
    return makeState([{ id: 'rune', cardId, owner: 0, zone: 'base' }], {
      phase: 'main',
      step: 'main',
      turnPlayer: 0,
      priority: 0,
    })
  }

  it.each([
    ['OGN-007', 'fury'],
    ['OGN-042', 'calm'],
    ['OGN-089', 'mind'],
    ['OGN-126', 'body'],
    ['OGN-166', 'chaos'],
    ['OGN-214', 'order'],
  ])('%s exhausts for one Energy', (cardId, domain) => {
    const result = applyAction(
      withRune(cardId),
      { type: 'activate-ability', player: 0, source: 'rune', abilityId: `${domain}-rune-energy` },
      testOracle,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.objects.rune?.exhausted).toBe(true)
    expect(result.state.players[0].runePool.energy).toBe(1)
  })

  it.each([
    ['OGN-007', 'fury'],
    ['OGN-042', 'calm'],
    ['OGN-089', 'mind'],
    ['OGN-126', 'body'],
    ['OGN-166', 'chaos'],
    ['OGN-214', 'order'],
  ])('%s recycles for one Power of its domain', (cardId, domain) => {
    const result = applyAction(
      withRune(cardId),
      { type: 'activate-ability', player: 0, source: 'rune', abilityId: `${domain}-rune-power` },
      testOracle,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.players[0].runePool.power).toEqual({ [domain]: 1 })
    expect(result.state.players[0].runeDeck).toEqual(['rune'])
  })
})

describe('OGN triggered abilities in play', () => {
  it('OGN-087 Lecturing Yordle draws 1 when played', () => {
    const played = act(mainPhase([{ id: 'yordle', cardId: 'OGN-087', owner: 0, at: 'hand' }]), {
      type: 'play-card',
      player: 0,
      card: 'yordle',
    })
    expect(played.chain[0]).toMatchObject({ abilityId: 'lecturing-yordle-draw' })
    expect(settle(played).players[0].hand).toHaveLength(1)
  })

  it('OGN-132 First Mate readies another unit, never itself', () => {
    const start = mainPhase([
      { id: 'mate', cardId: 'OGN-132', owner: 0, at: 'hand' },
      { id: 'tired', cardId: 'OGN-219', owner: 0, at: base(0), exhausted: true },
    ])
    const played = act(start, { type: 'play-card', player: 0, card: 'mate' })
    let offered: readonly string[] = []
    const after = settle(played, (candidates) => {
      offered = candidates
      return ['tired']
    })
    expect(offered).toContain('tired')
    expect(offered).not.toContain('mate')
    expect(after.objects.tired?.exhausted).toBe(false)
  })

  it('OGN-130 Crackshot Corsair deals 1 to an enemy unit there when it attacks', () => {
    const start = mainPhase([
      { id: 'corsair', cardId: 'OGN-130', owner: 0, at: base(0) },
      { id: 'here', cardId: 'OGN-088', owner: 1, at: field('bf-0') }, // 8 Might
      { id: 'elsewhere', cardId: 'OGN-088', owner: 1, at: field('bf-1') },
    ])
    const moved = act(start, {
      type: 'move',
      player: 0,
      units: ['corsair'],
      to: { kind: 'battlefield', id: 'bf-0' },
    })
    expect(moved.showdown?.combat).toBe(true)
    expect(moved.chain[0]).toMatchObject({ abilityId: 'crackshot-corsair-shot' })

    let offered: readonly string[] = []
    const shot = settle(moved, (candidates) => {
      offered = candidates
      return candidates.slice(0, 1)
    })
    expect(offered).toEqual(['here'])
    expect(shot.objects.here?.damage).toBe(1)
  })
})

describe('OGN Might given this turn', () => {
  it('OGN-206 Back to Back gives two friendly units +2 each', () => {
    const start = mainPhase([
      { id: 'spell', cardId: 'OGN-206', owner: 0, at: 'hand' },
      { id: 'a', cardId: 'OGN-219', owner: 0, at: base(0) },
      { id: 'b', cardId: 'OGN-219', owner: 0, at: field('bf-0') },
      { id: 'c', cardId: 'OGN-219', owner: 0, at: base(0) },
      { id: 'foe', cardId: 'OGN-219', owner: 1, at: field('bf-1') },
    ])
    const played = act(start, { type: 'play-card', player: 0, card: 'spell' })
    let offered: readonly string[] = []
    const after = settle(played, (candidates, min) => {
      offered = candidates
      expect(min).toBe(2)
      return ['a', 'b']
    })
    expect([...offered].sort()).toEqual(['a', 'b', 'c'])
    expect(after.objects.a?.mightThisTurn).toBe(2)
    expect(after.objects.b?.mightThisTurn).toBe(2)
    expect(after.objects.c?.mightThisTurn).toBeUndefined()
    expect(after.objects.a?.buffs).toBe(0)
  })

  it('OGN-095 Stupefy gives a unit -1 this turn and draws 1', () => {
    const start = mainPhase([
      { id: 'spell', cardId: 'OGN-095', owner: 0, at: 'hand' },
      { id: 'foe', cardId: 'OGN-219', owner: 1, at: field('bf-1') },
    ])
    const after = settle(act(start, { type: 'play-card', player: 0, card: 'spell' }))
    expect(after.objects.foe?.mightThisTurn).toBe(-1)
    expect(after.players[0].hand).toHaveLength(1)
  })

  it('OGN-095 Stupefy takes nothing from a 1 Might unit (477.3.b)', () => {
    const start = mainPhase([
      { id: 'spell', cardId: 'OGN-095', owner: 0, at: 'hand' },
      { id: 'foe', cardId: 'OGN-219', owner: 1, at: field('bf-1') },
    ])
    const foe = start.objects.foe
    if (!foe) throw new Error('missing unit')
    const weakened = { ...start, objects: { ...start.objects, foe: { ...foe, mightThisTurn: -3 } } }
    const after = settle(act(weakened, { type: 'play-card', player: 0, card: 'spell' }))
    expect(after.objects.foe?.mightThisTurn).toBe(-3)
  })

  it('OGN-103 Ravenbloom Student gets +1 when its player plays a spell', () => {
    const start = mainPhase([
      { id: 'student', cardId: 'OGN-103', owner: 0, at: base(0) },
      { id: 'spell', cardId: 'OGN-085', owner: 0, at: 'hand' }, // Falling Comet, no targets here
    ])
    const played = act(start, { type: 'play-card', player: 0, card: 'spell' })
    expect(played.chain.map((c) => c.abilityId ?? 'spell')).toEqual([
      'spell',
      'ravenbloom-student-empowered',
    ])
    expect(settle(played).objects.student?.mightThisTurn).toBe(1)
  })
})

describe('OGN keywords in combat', () => {
  it('OGN-087 Lecturing Yordle (Tank) takes damage before a bigger ally', () => {
    // Daring Poro attacks as a 3 (2 Might, Assault). Without Tank, all 3 would
    // land on the Mech listed first and nothing would die.
    const { state } = attackInto(
      mainPhase([
        { id: 'poro', cardId: 'OGN-210', owner: 0, at: base(0) },
        { id: 'mech', cardId: 'OGN-088', owner: 1, at: field('bf-0') },
        { id: 'yordle', cardId: 'OGN-087', owner: 1, at: field('bf-0') },
      ]),
      ['poro'],
      'bf-0',
    )
    expect(state.objects.yordle?.zone).toBe('trash')
    expect(state.objects.mech?.zone).toBe('battlefield')
  })

  it.each([
    ['OGN-210', 'Daring Poro', ['assault']],
    ['OGN-215', 'Petty Officer', ['assault']],
    ['OGN-052', 'Stalwart Poro', ['shield']],
    ['OGN-087', 'Lecturing Yordle', ['tank']],
    ['OGN-191', 'Maddened Marauder', ['tank']],
    ['OGN-137', 'Stormclaw Ursine', ['tank']],
  ])('%s %s has its printed keyword', (id, _name, keywords) => {
    expect(getCard(id)?.keywords).toEqual(keywords)
  })

  it('OGN-052 Stalwart Poro defends as a 3 (Shield)', () => {
    const { events } = attackInto(
      mainPhase([
        { id: 'attacker', cardId: 'OGN-088', owner: 0, at: base(0) },
        { id: 'poro', cardId: 'OGN-052', owner: 1, at: field('bf-0') },
      ]),
      ['attacker'],
      'bf-0',
    )
    expect(events).toContainEqual({ type: 'damage-dealt', target: 'attacker', amount: 3 })
  })
})

describe('OGN units entering ready and moving', () => {
  it('OGN-129 Confront: units its player plays this turn enter ready, and it draws 1', () => {
    const start = mainPhase([
      { id: 'confront', cardId: 'OGN-129', owner: 0, at: 'hand' },
      { id: 'unit', cardId: 'OGN-219', owner: 0, at: 'hand' },
    ])
    const confronted = settle(act(start, { type: 'play-card', player: 0, card: 'confront' }))
    expect(confronted.players[0].hand).toHaveLength(2) // the unit, and the draw
    const played = settle(act(confronted, { type: 'play-card', player: 0, card: 'unit' }))
    expect(played.objects.unit).toMatchObject({ zone: 'base', exhausted: false })
  })

  it('OGN-191 Maddened Marauder moves a unit from a battlefield to its base when played', () => {
    const start = mainPhase([
      { id: 'marauder', cardId: 'OGN-191', owner: 0, at: 'hand' },
      { id: 'foe', cardId: 'OGN-219', owner: 1, at: field('bf-0') },
      { id: 'home', cardId: 'OGN-219', owner: 1, at: base(1) },
    ])
    const held = {
      ...start,
      battlefields: start.battlefields.map((bf) =>
        bf.id === 'bf-0' ? { ...bf, controller: 1 as const } : bf,
      ),
    }
    let offered: readonly string[] = []
    const played = act(held, { type: 'play-card', player: 0, card: 'marauder' })
    const after = settle(played, (candidates) => {
      offered = candidates
      return ['foe']
    })
    expect(offered).toEqual(['foe'])
    expect(after.objects.foe).toMatchObject({ zone: 'base', location: base(1) })
    expect(after.battlefields.find((bf) => bf.id === 'bf-0')?.controller).toBeUndefined()
  })
})

describe('OGN cards that move cards between zones', () => {
  it("OGN-169 Gust returns a unit at a battlefield with 3 Might or less to its owner's hand", () => {
    const start = mainPhase([
      { id: 'gust', cardId: 'OGN-169', owner: 0, at: 'hand' },
      { id: 'small', cardId: 'OGN-013', owner: 1, at: field('bf-0') }, // 2 Might
      { id: 'big', cardId: 'OGN-219', owner: 1, at: field('bf-0') }, // 4 Might
      { id: 'home', cardId: 'OGN-013', owner: 1, at: base(1) },
    ])
    const small = start.objects.small
    if (!small) throw new Error('missing unit')
    const damaged = {
      ...start,
      objects: { ...start.objects, small: { ...small, damage: 1, buffs: 1 } },
    }
    let offered: readonly string[] = []
    const after = settle(act(damaged, { type: 'play-card', player: 0, card: 'gust' }), (c) => {
      offered = c
      return ['small']
    })
    expect(offered).toEqual(['small']) // 2 Might plus a Buff is 3; the 4 Might unit is not
    expect(after.objects.small).toMatchObject({ zone: 'hand', damage: 0, buffs: 0 })
    expect(after.players[1].hand).toEqual(['small'])
  })

  it("OGN-170 Morbid Return returns a unit from its player's trash to hand", () => {
    const start = mainPhase([
      { id: 'morbid', cardId: 'OGN-170', owner: 0, at: 'hand' },
      { id: 'dead', cardId: 'OGN-219', owner: 0, at: 'trash' },
      { id: 'spell', cardId: 'OGS-003', owner: 0, at: 'trash' },
      { id: 'theirs', cardId: 'OGN-219', owner: 1, at: 'trash' },
    ])
    let offered: readonly string[] = []
    const after = settle(act(start, { type: 'play-card', player: 0, card: 'morbid' }), (c) => {
      offered = c
      return ['dead']
    })
    expect(offered).toEqual(['dead'])
    expect(after.players[0].hand).toEqual(['dead'])
    expect(after.players[0].trash).toEqual(['morbid', 'spell'])
  })

  it("OGN-185 Traveling Merchant discards 1 of its player's choice, then draws 1, when it moves", () => {
    const start = mainPhase([
      { id: 'merchant', cardId: 'OGN-185', owner: 0, at: base(0) },
      { id: 'keep', cardId: 'OGS-003', owner: 0, at: 'hand' },
      { id: 'toss', cardId: 'OGN-219', owner: 0, at: 'hand' },
    ])
    const moved = act(start, { type: 'move', player: 0, units: ['merchant'], to: field('bf-0') })
    expect(moved.chain[0]).toMatchObject({ abilityId: 'traveling-merchant-trade' })
    let offered: readonly string[] = []
    const after = settle(moved, (c) => {
      offered = c
      return ['toss']
    })
    expect([...offered].sort()).toEqual(['keep', 'toss'])
    expect(after.players[0].trash).toEqual(['toss'])
    expect(after.players[0].hand).toHaveLength(2) // keep, and the draw
    expect(after.players[0].hand).toContain('keep')
  })

  it('OGN-137 Stormclaw Ursine channels 1 rune exhausted when played', () => {
    const start = mainPhase([
      { id: 'bear', cardId: 'OGN-137', owner: 0, at: 'hand' },
      { id: 'rune-a', cardId: 'OGN-126', owner: 0, at: 'runeDeck' },
      { id: 'rune-b', cardId: 'OGN-126', owner: 0, at: 'runeDeck' },
    ])
    const after = settle(act(start, { type: 'play-card', player: 0, card: 'bear' }))
    expect(after.objects['rune-a']).toMatchObject({ zone: 'base', exhausted: true })
    expect(after.players[0].runeDeck).toEqual(['rune-b'])
    expect(after.players[0].base).toContain('rune-a')
  })
})
