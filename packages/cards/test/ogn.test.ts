import { describe, expect, it } from 'vitest'

import {
  advanceFlow,
  applyAction,
  beginExecution,
  legalActions,
  mightOf,
  redactFor,
  spellCost,
} from '@rb/engine'
import type { GameState } from '@rb/engine'

import { getCard } from '../src/registry.js'
import { OGN_CARDS } from '../src/sets/ogn/index.js'
import { makeState } from '../../engine/test/support/state.js'
import { PLAIN_BATTLEFIELD, act, base, field, mainPhase, oracle, settle } from './support/game.js'
import { attackInto, fightOut } from './support/combat.js'
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
  ['OGN-275', 'Altar to Unity', 'battlefield', [], null, 0, null],
  ['OGN-276', "Aspirant's Climb", 'battlefield', [], null, 0, null],
  ['OGN-277', 'Back-Alley Bar', 'battlefield', [], null, 0, null],
  ['OGN-278', 'Bandle Tree', 'battlefield', [], null, 0, null],
  ['OGN-280', 'Grove of the God-Willow', 'battlefield', [], null, 0, null],
  ['OGN-281', 'Hallowed Tomb', 'battlefield', [], null, 0, null],
  ['OGN-282', 'Monastery of Hirana', 'battlefield', [], null, 0, null],
  ['OGN-283', 'Navori Fighting Pit', 'battlefield', [], null, 0, null],
  ['OGN-284', 'Obelisk of Power', 'battlefield', [], null, 0, null],
  ['OGN-285', "Reaver's Row", 'battlefield', [], null, 0, null],
  ['OGN-286', "Reckoner's Arena", 'battlefield', [], null, 0, null],
  ['OGN-287', 'Sigil of the Storm', 'battlefield', [], null, 0, null],
  ['OGN-289', "Targon's Peak", 'battlefield', [], null, 0, null],
  ['OGN-290', "The Arena's Greatest", 'battlefield', [], null, 0, null],
  ['OGN-291', 'The Candlelit Sanctum', 'battlefield', [], null, 0, null],
  ['OGN-292', 'The Dreaming Tree', 'battlefield', [], null, 0, null],
  ['OGN-293', 'The Grand Plaza', 'battlefield', [], null, 0, null],
  ['OGN-295', "Vilemaw's Lair", 'battlefield', [], null, 0, null],
  ['OGN-297', 'Windswept Hillock', 'battlefield', [], null, 0, null],
  ['OGN-298', 'Zaun Warrens', 'battlefield', [], null, 0, null],
]

describe('OGN cards used by the Proving Grounds decks', () => {
  it('covers every entered OGN card, and nothing is left out of the table', () => {
    // The Legends have a table of their own, in ogn-legends.test.ts.
    const entered = OGN_CARDS.filter((card) => card.type !== 'legend').map((card) => card.id)
    expect(entered.sort()).toEqual(PRINTED.map(([id]) => id).sort())
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
      'startipped-peak-channel',
      'mobilize-effect',
      'disintegrate-effect',
      'en-garde-effect',
      'cannon-barrage-effect',
      'wielder-of-water-alone',
      'trifarian-war-camp-might',
      'void-gate-bonus-damage',
      'faithful-manufactor-recruit',
      'noxian-drummer-recruit',
      'sai-scout-open-battlefield',
      'sneaky-deckhand-open-battlefield',
      'eager-apprentice-discount',
      'meditation-effect',
      'fortified-position-shield',
      'dune-drake-hunt',
      'altar-to-unity-recruit',
      'aspirants-climb-victory-score',
      'grove-of-the-god-willow-draw',
      'navori-fighting-pit-buff',
      'reavers-row-retreat',
      'sigil-of-the-storm-recycle',
      'the-grand-plaza-win',
      'vilemaws-lair-no-retreat',
      'windswept-hillock-ganking',
      'zaun-warrens-cycle',
      'daughter-of-the-void-power',
      'loose-cannon-draw',
      'blind-monk-buff',
      'herald-of-the-arcane-recruit',
      'bounty-hunter-ganking',
      'the-boss-ready',
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
      { id: 'spell', cardId: 'OGN-085', owner: 0, at: 'hand' }, // Falling Comet
      { id: 'foe', cardId: 'OGN-088', owner: 1, at: field('bf-0') }, // something to target
    ])
    const cast = act(start, { type: 'play-card', player: 0, card: 'spell' })
    // It picks its target first (355.5); the trigger joins once it is played.
    const played = act(cast, { type: 'resolve-choice', player: 0, chosen: ['foe'] })
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

describe('OGN cards with a choice to make or a condition to check', () => {
  /** Player 0's Scoring Step, holding bf-0 as Startipped Peak with a unit there. */
  const holdingPeak = (): GameState => {
    const start = mainPhase(
      [
        { id: 'guard', cardId: 'OGN-219', owner: 0, at: field('bf-0') },
        { id: 'rune-a', cardId: 'OGN-126', owner: 0, at: 'runeDeck' },
      ],
      ['OGN-288', PLAIN_BATTLEFIELD],
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

  it('OGN-288 Startipped Peak: when you hold here, you may channel 1 rune exhausted', () => {
    const held = advanceFlow(holdingPeak(), oracle).state
    expect(held.chain[0]).toMatchObject({ source: 'bf-0', abilityId: 'startipped-peak-channel' })

    let asking = held
    while (!asking.pendingChoice) {
      asking = act(asking, { type: 'pass', player: asking.priority ?? 0 })
    }
    // A yes-or-no question to the player who held it, about the Peak itself.
    expect(asking.pendingChoice).toMatchObject({
      player: 0,
      kind: 'may',
      candidates: ['bf-0'],
      min: 0,
      max: 1,
    })
    const yes = settle(asking, (candidates) => candidates)
    expect(yes.objects['rune-a']).toMatchObject({ zone: 'base', exhausted: true })
  })

  it('OGN-288 Startipped Peak channels nothing when its player declines', () => {
    const held = advanceFlow(holdingPeak(), oracle).state
    const no = settle(held, () => [])
    // Not channelled exhausted by the Peak: the turn then reaches its Channel
    // Phase, which channels it ready as usual (430.2.a).
    expect(no.phase).toBe('main')
    expect(no.objects['rune-a']).toMatchObject({ zone: 'base', exhausted: false })
  })

  it('OGN-134 Mobilize channels 1 rune exhausted, or draws 1 if it cannot', () => {
    const withRune = mainPhase([
      { id: 'mobilize', cardId: 'OGN-134', owner: 0, at: 'hand' },
      { id: 'rune-a', cardId: 'OGN-126', owner: 0, at: 'runeDeck' },
    ])
    const channelled = settle(act(withRune, { type: 'play-card', player: 0, card: 'mobilize' }))
    expect(channelled.objects['rune-a']).toMatchObject({ zone: 'base', exhausted: true })
    expect(channelled.players[0].hand).toEqual([])

    const noRunes = mainPhase([{ id: 'mobilize', cardId: 'OGN-134', owner: 0, at: 'hand' }])
    const drew = settle(act(noRunes, { type: 'play-card', player: 0, card: 'mobilize' }))
    expect(drew.players[0].hand).toHaveLength(1)
  })

  it('OGN-005 Disintegrate deals 3, and draws 1 only if that kills the unit', () => {
    const cast = (victim: string) =>
      settle(
        act(
          mainPhase([
            { id: 'spell', cardId: 'OGN-005', owner: 0, at: 'hand' },
            { id: 'victim', cardId: victim, owner: 1, at: field('bf-0') },
          ]),
          { type: 'play-card', player: 0, card: 'spell' },
        ),
      )
    const survived = cast('OGN-219') // 4 Might
    expect(survived.objects.victim?.damage).toBe(3)
    expect(survived.players[0].hand).toEqual([])

    const killed = cast('OGN-013') // 2 Might
    expect(killed.objects.victim?.zone).toBe('trash')
    expect(killed.players[0].hand).toHaveLength(1)
  })

  it('OGN-046 En Garde gives +1, and +1 more if the unit is the only one its player controls there', () => {
    const cast = (extra: Parameters<typeof mainPhase>[0]) =>
      settle(
        act(
          mainPhase([
            { id: 'spell', cardId: 'OGN-046', owner: 0, at: 'hand' },
            { id: 'duelist', cardId: 'OGN-219', owner: 0, at: field('bf-0') },
            ...extra,
          ]),
          { type: 'play-card', player: 0, card: 'spell' },
        ),
        () => ['duelist'],
      )
    // Alone, apart from an enemy (who does not count).
    expect(
      cast([{ id: 'foe', cardId: 'OGN-219', owner: 1, at: field('bf-0') }]).objects.duelist
        ?.mightThisTurn,
    ).toBe(2)
    // Another friendly unit there: only the first +1.
    expect(
      cast([{ id: 'friend', cardId: 'OGN-219', owner: 0, at: field('bf-0') }]).objects.duelist
        ?.mightThisTurn,
    ).toBe(1)
  })

  it('OGN-127 Cannon Barrage deals 2 to each enemy unit in combat, and no other', () => {
    const start = mainPhase([
      { id: 'attacker', cardId: 'OGN-088', owner: 0, at: base(0) },
      { id: 'barrage', cardId: 'OGN-127', owner: 0, at: 'hand' },
      { id: 'fighting', cardId: 'OGN-088', owner: 1, at: field('bf-0') },
      { id: 'elsewhere', cardId: 'OGN-088', owner: 1, at: field('bf-1') },
    ])
    const moved = act(start, { type: 'move', player: 0, units: ['attacker'], to: field('bf-0') })
    expect(moved.showdown?.combat).toBe(true)
    const played = act(moved, { type: 'play-card', player: 0, card: 'barrage' })
    const after = settle(played)
    expect(after.objects.fighting?.damage).toBe(2)
    expect(after.objects.elsewhere?.damage).toBe(0)
    expect(after.objects.attacker?.damage).toBe(0)
  })
})

describe('OGN passives', () => {
  const mightIn = (state: GameState, id: string) => {
    const object = state.objects[id]
    return object && mightOf(state, object, oracle)
  }

  it('OGN-055 Wielder of Water has +2 Might while attacking or defending alone', () => {
    const attack = (withFriend: boolean) =>
      act(
        mainPhase([
          { id: 'wielder', cardId: 'OGN-055', owner: 0, at: base(0) }, // 2 Might
          ...(withFriend
            ? [{ id: 'friend', cardId: 'OGN-219', owner: 0 as const, at: base(0) }]
            : []),
          { id: 'foe', cardId: 'OGN-088', owner: 1, at: field('bf-0') },
        ]),
        {
          type: 'move',
          player: 0,
          units: withFriend ? ['wielder', 'friend'] : ['wielder'],
          to: field('bf-0'),
        },
      )
    expect(mightIn(attack(false), 'wielder')).toBe(4)
    expect(mightIn(attack(true), 'wielder')).toBe(2)
    // And not outside combat at all.
    expect(mightIn(mainPhase([{ id: 'w', cardId: 'OGN-055', owner: 0, at: base(0) }]), 'w')).toBe(2)
  })

  it('OGN-294 Trifarian War Camp gives every unit there +1 Might, whoever controls it', () => {
    const state = mainPhase(
      [
        { id: 'mine', cardId: 'OGN-219', owner: 0, at: field('bf-0') },
        { id: 'theirs', cardId: 'OGN-219', owner: 1, at: field('bf-0') },
        { id: 'elsewhere', cardId: 'OGN-219', owner: 0, at: field('bf-1') },
        { id: 'home', cardId: 'OGN-219', owner: 0, at: base(0) },
      ],
      ['OGN-294', PLAIN_BATTLEFIELD],
    )
    expect(mightIn(state, 'mine')).toBe(5)
    expect(mightIn(state, 'theirs')).toBe(5)
    expect(mightIn(state, 'elsewhere')).toBe(4)
    expect(mightIn(state, 'home')).toBe(4)
  })

  it('OGN-296 Void Gate: spells deal 1 Bonus Damage to units there, from either player', () => {
    const incinerate = (target: 'bf-0' | 'bf-1') =>
      settle(
        act(
          mainPhase(
            [
              { id: 'spell', cardId: 'OGS-003', owner: 0, at: 'hand' }, // Deal 2
              { id: 'foe', cardId: 'OGN-088', owner: 1, at: field(target) }, // 8 Might
            ],
            ['OGN-296', PLAIN_BATTLEFIELD],
          ),
          { type: 'play-card', player: 0, card: 'spell' },
        ),
        () => ['foe'],
      )
    expect(incinerate('bf-0').objects.foe?.damage).toBe(3)
    expect(incinerate('bf-1').objects.foe?.damage).toBe(2)
  })
})

describe('OGN cards that play tokens', () => {
  const recruits = (state: GameState) =>
    Object.values(state.objects).filter((object) => object.cardId === 'TOK-001')

  it('OGN-211 Faithful Manufactor plays a Recruit token where it is, its base', () => {
    const start = mainPhase([{ id: 'manufactor', cardId: 'OGN-211', owner: 0, at: 'hand' }])
    const after = settle(act(start, { type: 'play-card', player: 0, card: 'manufactor' }))
    expect(recruits(after)).toEqual([
      expect.objectContaining({ controller: 0, zone: 'base', location: base(0), token: true }),
    ])
  })

  it('OGN-222 Noxian Drummer plays a Recruit token at the battlefield it moves to', () => {
    const start = mainPhase([{ id: 'drummer', cardId: 'OGN-222', owner: 0, at: base(0) }])
    const moved = act(start, { type: 'move', player: 0, units: ['drummer'], to: field('bf-0') })
    const after = settle(moved)
    expect(recruits(after)).toEqual([
      expect.objectContaining({ zone: 'battlefield', location: field('bf-0') }),
    ])
  })

  it('OGN-222 Noxian Drummer plays nothing when it moves back to base', () => {
    const start = mainPhase([{ id: 'drummer', cardId: 'OGN-222', owner: 0, at: field('bf-0') }])
    const moved = act(start, { type: 'move', player: 0, units: ['drummer'], to: base(0) })
    expect(moved.chain).toEqual([])
    expect(recruits(settle(moved))).toEqual([])
  })
})

describe('where units are played (355.2), and Vision', () => {
  const plays = (state: GameState, card: string) =>
    legalActions(state, 0, oracle).flatMap((action) =>
      action.type === 'play-card' && action.card === card
        ? [action.to?.kind === 'battlefield' ? action.to.id : 'base']
        : [],
    )

  it('any unit may be played to a battlefield its player controls, not to others', () => {
    const start = mainPhase([
      { id: 'unit', cardId: 'OGN-219', owner: 0, at: 'hand' },
      { id: 'holder', cardId: 'OGN-219', owner: 0, at: field('bf-0') },
    ])
    const held: GameState = {
      ...start,
      battlefields: start.battlefields.map((bf) =>
        bf.id === 'bf-0' ? { ...bf, controller: 0 as const } : bf,
      ),
    }
    expect(plays(held, 'unit')).toEqual(['base', 'bf-0'])
    const after = settle(
      act(held, { type: 'play-card', player: 0, card: 'unit', to: field('bf-0') }),
    )
    expect(after.objects.unit).toMatchObject({
      zone: 'battlefield',
      location: field('bf-0'),
      exhausted: true,
    })
    expect(() =>
      act(held, { type: 'play-card', player: 0, card: 'unit', to: field('bf-1') }),
    ).toThrow(/cannot be played there/)
  })

  it('OGN-176 Sneaky Deckhand may be played to an open battlefield, and conquers it', () => {
    const start = mainPhase([
      { id: 'deckhand', cardId: 'OGN-176', owner: 0, at: 'hand' },
      { id: 'plain', cardId: 'OGN-219', owner: 0, at: 'hand' },
      { id: 'foe', cardId: 'OGN-219', owner: 1, at: field('bf-0') }, // bf-0 is occupied
    ])
    expect(plays(start, 'deckhand')).toEqual(['base', 'bf-1'])
    expect(plays(start, 'plain')).toEqual(['base'])

    const after = settle(
      act(start, { type: 'play-card', player: 0, card: 'deckhand', to: field('bf-1') }),
    )
    expect(after.objects.deckhand).toMatchObject({ zone: 'battlefield', location: field('bf-1') })
    expect(after.battlefields.find((bf) => bf.id === 'bf-1')?.controller).toBe(0)
    expect(after.players[0].points).toBe(1) // establishing Control is a Conquer (466.5.d)
  })

  it('OGN-171 Mystic Poro (Vision) shows its player the top card, and they may recycle it', () => {
    const start = mainPhase([{ id: 'poro', cardId: 'OGN-171', owner: 0, at: 'hand' }])
    const played = act(start, { type: 'play-card', player: 0, card: 'poro' })
    expect(played.chain[0]).toMatchObject({ source: 'poro', abilityId: 'vision' })

    let asking = played
    while (!asking.pendingChoice) {
      asking = act(asking, { type: 'pass', player: asking.priority ?? 0 })
    }
    const top = start.players[0].mainDeck[0]
    expect(asking.pendingChoice).toMatchObject({ kind: 'predict', candidates: [top] })
    // Looked at by its player alone (436.1).
    expect(top && redactFor(asking, 0).objects[top]).toBeDefined()
    expect(top && redactFor(asking, 1).objects[top]).toBeUndefined()

    const recycled = settle(asking, (candidates) => candidates)
    expect(recycled.players[0].mainDeck.at(-1)).toBe(top)
    const kept = settle(asking, () => [])
    expect(kept.players[0].mainDeck[0]).toBe(top)
  })

  it('OGN-174 Sai Scout has Vision and may be played to an open battlefield', () => {
    const start = mainPhase([{ id: 'scout', cardId: 'OGN-174', owner: 0, at: 'hand' }])
    expect(plays(start, 'scout')).toEqual(['base', 'bf-0', 'bf-1'])
    const played = act(start, { type: 'play-card', player: 0, card: 'scout', to: field('bf-0') })
    expect(played.chain[0]).toMatchObject({ source: 'scout', abilityId: 'vision' })
    const after = settle(played, () => [])
    expect(after.objects.scout?.location).toEqual(field('bf-0'))
  })
})

describe('OGN-013 Pouty Poro (Deflect)', () => {
  /** Player 0 holds Incinerate ("Deal 2 to a unit at a battlefield"); Poro is at bf-0. */
  const scene = (poroOwner: 0 | 1, power: Record<string, number>) => {
    const state = mainPhase([
      { id: 'spell', cardId: 'OGS-003', owner: 0, at: 'hand' },
      { id: 'poro', cardId: 'OGN-013', owner: poroOwner, at: field('bf-0') },
    ])
    const player = state.players[0]
    return {
      ...state,
      players: {
        ...state.players,
        0: { ...player, runePool: { ...player.runePool, power, universal: 0 } },
      },
    }
  }

  it("charges an opponent's spell 1 Power of any domain to target it (809.1.c)", () => {
    const cast = act(scene(1, { fury: 1, calm: 1 }), {
      type: 'play-card',
      player: 0,
      card: 'spell',
    })
    expect(cast.pendingChoice?.candidates).toEqual(['poro'])
    // Incinerate itself costs [2] and no Power, so the Power left is the Deflect's to take.
    const aimed = act(cast, { type: 'resolve-choice', player: 0, chosen: ['poro'] })
    const left = Object.values(aimed.players[0].runePool.power).reduce((a, n) => a + (n ?? 0), 0)
    expect(left).toBe(1)
    expect(settle(aimed).objects.poro?.zone).toBe('trash')
  })

  it('cannot be targeted by an opponent who cannot pay, so a spell with no other target cannot be played', () => {
    expect(() => act(scene(1, {}), { type: 'play-card', player: 0, card: 'spell' })).toThrow(
      /nothing that card can target/,
    )
  })

  it("costs nothing for its own controller's spells", () => {
    const cast = act(scene(0, {}), { type: 'play-card', player: 0, card: 'spell' })
    const aimed = act(cast, { type: 'resolve-choice', player: 0, chosen: ['poro'] })
    expect(settle(aimed).objects.poro?.zone).toBe('trash')
  })
})

describe('the last of the Proving Grounds cards', () => {
  it('OGN-084 Eager Apprentice: spells cost 1 less Energy while it is at a battlefield, to a minimum of 1', () => {
    const cost = (at: 'base' | 'bf-0', energy: number) => {
      const state = mainPhase([
        { id: 'apprentice', cardId: 'OGN-084', owner: 0, at: at === 'base' ? base(0) : field(at) },
      ])
      return spellCost(state, oracle, 0, { energy, power: [] }).energy
    }
    expect(cost('bf-0', 5)).toBe(4)
    expect(cost('bf-0', 2)).toBe(1)
    expect(cost('bf-0', 1)).toBe(1) // the minimum
    expect(cost('base', 5)).toBe(5)
    // And only for its controller's spells.
    const theirs = mainPhase([{ id: 'apprentice', cardId: 'OGN-084', owner: 1, at: field('bf-0') }])
    expect(spellCost(theirs, oracle, 0, { energy: 5, power: [] }).energy).toBe(5)
  })

  it('OGN-084 Eager Apprentice lets a spell be played with the Energy the discount saves', () => {
    const scene = (at: 'base' | 'bf-1') => {
      const state = mainPhase([
        { id: 'apprentice', cardId: 'OGN-084', owner: 0, at: at === 'base' ? base(0) : field(at) },
        { id: 'spell', cardId: 'OGS-003', owner: 0, at: 'hand' }, // Incinerate, 2 Energy
        { id: 'foe', cardId: 'OGN-088', owner: 1, at: field('bf-0') },
      ])
      const player = state.players[0]
      return {
        ...state,
        players: {
          ...state.players,
          0: { ...player, runePool: { ...player.runePool, energy: 1 } },
        },
      }
    }
    const played = act(scene('bf-1'), { type: 'play-card', player: 0, card: 'spell' })
    expect(played.players[0].runePool.energy).toBe(0)
    expect(() => act(scene('base'), { type: 'play-card', player: 0, card: 'spell' })).toThrow(
      /cannot pay/,
    )
  })

  it('OGN-048 Meditation: exhaust a friendly unit as it is played to draw 2, or draw 1', () => {
    const start = mainPhase([
      { id: 'meditation', cardId: 'OGN-048', owner: 0, at: 'hand' },
      { id: 'monk', cardId: 'OGN-219', owner: 0, at: base(0) },
    ])
    const asked = act(start, { type: 'play-card', player: 0, card: 'meditation' })
    expect(asked.pendingChoice).toMatchObject({
      kind: 'cost',
      candidates: ['monk'],
      min: 0,
      max: 1,
    })

    const paid = act(asked, { type: 'resolve-choice', player: 0, chosen: ['monk'] })
    expect(paid.objects.monk?.exhausted).toBe(true) // paid now, before it resolves
    expect(settle(paid).players[0].hand).toHaveLength(2)

    const declined = act(asked, { type: 'resolve-choice', player: 0, chosen: [] })
    expect(declined.objects.monk?.exhausted).toBe(false)
    expect(settle(declined).players[0].hand).toHaveLength(1)
  })

  it('OGN-048 Meditation asks nothing with no ready friendly unit, and draws 1', () => {
    const start = mainPhase([
      { id: 'meditation', cardId: 'OGN-048', owner: 0, at: 'hand' },
      { id: 'tired', cardId: 'OGN-219', owner: 0, at: base(0), exhausted: true },
    ])
    const played = act(start, { type: 'play-card', player: 0, card: 'meditation' })
    expect(played.pendingChoice).toBeNull()
    expect(settle(played).players[0].hand).toHaveLength(1)
  })

  it('OGN-279 Fortified Position: when you defend here, a unit gains Shield 2 this combat', () => {
    const start = mainPhase(
      [
        { id: 'attacker', cardId: 'OGN-049', owner: 0, at: base(0) }, // 5 Might
        { id: 'guard', cardId: 'OGN-219', owner: 1, at: field('bf-0') }, // 4 Might
      ],
      ['OGN-279', PLAIN_BATTLEFIELD],
    )
    const moved = act(start, { type: 'move', player: 0, units: ['attacker'], to: field('bf-0') })
    expect(moved.chain[0]).toMatchObject({ source: 'bf-0', controller: 1 })
    expect(moved.pendingChoice).toMatchObject({ player: 1 })

    const after = fightOut(moved, () => ['guard'])
    // Shield 2 made the guard a 6: it survived the 5 and dealt 6.
    expect(after.objects.guard?.zone).toBe('battlefield')
    expect(after.objects.attacker?.zone).toBe('trash')
    expect(after.objects.guard?.keywordsThisCombat).toBeUndefined() // gone with the combat
  })

  it('OGN-131 Dune Drake gets +2 Might when it attacks where there is a ready enemy, and keeps it', () => {
    const attack = (enemyExhausted: boolean) =>
      settle(
        act(
          mainPhase([
            { id: 'drake', cardId: 'OGN-131', owner: 0, at: base(0) },
            {
              id: 'foe',
              cardId: 'OGN-088',
              owner: 1,
              at: field('bf-0'),
              exhausted: enemyExhausted,
            },
          ]),
          { type: 'move', player: 0, units: ['drake'], to: field('bf-0') },
        ),
      )
    const ready = attack(false)
    expect(ready.objects.drake?.mightWhileOnBoard).toBe(2)
    // No duration was printed: it does not expire with the turn.
    const { showdown: _combat, ...afterCombat } = ready
    const ended = advanceFlow(
      { ...afterCombat, phase: 'ending', step: 'expiration', stepTaskDone: false, priority: null },
      oracle,
    ).state
    expect(ended.objects.drake?.mightWhileOnBoard).toBe(2)

    expect(attack(true).objects.drake?.mightWhileOnBoard).toBeUndefined()
  })
})
