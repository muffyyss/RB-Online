import { describe, expect, it } from 'vitest'

import { mightOf } from '@rb/engine'
import type { GameState, ObjectId } from '@rb/engine'

import { getCard } from '../src/registry.js'
import { act, base, field, mainPhase, oracle, settle } from './support/game.js'
import { fightOut } from './support/combat.js'
import type { Spec } from './support/game.js'

/**
 * Each Origins Legend's Signature spell (135.2.e.6).
 *
 * A Signature card pays its [C] Power with either of its Domains and may only
 * be in a deck led by its champion. Seven play; the other five say what the DSL
 * still lacks.
 *
 * [id, name, champion tag, domains, energy, [C] count]
 */
const PRINTED: [string, string, string, string[], number, number][] = [
  ['OGN-248', 'Icathian Rain', 'Kai’Sa', ['fury', 'mind'], 7, 3],
  ['OGN-250', 'Stormbringer', 'Volibear', ['body', 'fury'], 6, 2],
  ['OGN-252', 'Super Mega Death Rocket!', 'Jinx', ['chaos', 'fury'], 4, 1],
  ['OGN-254', 'Noxian Guillotine', 'Darius', ['fury', 'order'], 4, 1],
  ['OGN-256', 'Fox-Fire', 'Ahri', ['calm', 'mind'], 3, 0],
  ['OGN-258', 'Dragon’s Rage', 'Lee Sin', ['body', 'calm'], 4, 1],
  ['OGN-260', 'Last Breath', 'Yasuo', ['calm', 'chaos'], 3, 2],
  ['OGN-262', 'Zenith Blade', 'Leona', ['calm', 'order'], 3, 2],
  ['OGN-264', 'Guerilla Warfare', 'Teemo', ['chaos', 'mind'], 2, 1],
  ['OGN-266', 'Siphon Power', 'Viktor', ['mind', 'order'], 2, 1],
  ['OGN-268', 'Bullet Time', 'Miss Fortune', ['body', 'chaos'], 1, 0],
  ['OGN-270', 'Showstopper', 'Sett', ['body', 'order'], 1, 1],
]

describe('the Signature spells of Origins', () => {
  it.each(PRINTED)('%s %s is printed as it is on the card', (id, name, tag, domains, energy, c) => {
    const card = getCard(id)
    // The printed apostrophe is typographic; the card data keeps a plain one.
    expect(card?.name.replace("'", '’')).toBe(name)
    expect(card).toMatchObject({ type: 'spell', supertypes: ['signature'], tags: [tag] })
    expect([...(card?.domains ?? [])].sort()).toEqual([...domains].sort())
    expect(card?.cost?.energy).toBe(energy)
    expect(card?.cost?.power).toEqual(Array.from({ length: c }, () => ({ kind: 'self' })))
  })
})

/**
 * Answer each choice with the first id on the list that is a candidate, or the
 * first candidate. A `may` is asked about the spell itself, so naming nothing
 * that matches says yes.
 */
function prefer(...ids: ObjectId[]) {
  return (candidates: readonly ObjectId[]) => {
    const wanted = ids.find((id) => candidates.includes(id))
    return wanted === undefined ? candidates.slice(0, 1) : [wanted]
  }
}

function cast(spell: string, specs: readonly Spec[], ...choices: ObjectId[]): GameState {
  const start = mainPhase([{ id: 'spell', cardId: spell, owner: 0, at: 'hand' }, ...specs])
  return settle(act(start, { type: 'play-card', player: 0, card: 'spell' }), prefer(...choices))
}

describe('Signature spells that play', () => {
  it('OGN-248 Icathian Rain deals 2 six times, choosing each time', () => {
    const after = cast(
      'OGN-248',
      [
        { id: 'big', cardId: 'OGN-088', owner: 1, at: field('bf-0') }, // 8 Might
        { id: 'wall', cardId: 'OGN-088', owner: 1, at: field('bf-1') },
      ],
      'big',
      'wall',
    )
    // Four at the first until it dies, then the last two at the next.
    expect(after.objects.big?.zone).toBe('trash')
    expect(after.objects.wall?.damage).toBe(4)
  })

  it('OGN-250 Stormbringer hits every enemy there with its Might, then moves in', () => {
    const after = cast(
      'OGN-250',
      [
        { id: 'hammer', cardId: 'OGN-088', owner: 0, at: base(0) }, // 8 Might
        { id: 'small', cardId: 'OGN-219', owner: 1, at: field('bf-1') }, // 4
        { id: 'drake', cardId: 'OGN-142', owner: 1, at: field('bf-1') }, // 10
        { id: 'elsewhere', cardId: 'OGN-219', owner: 1, at: field('bf-0') },
      ],
      'hammer',
      'bf-1',
    )
    expect(after.objects.small?.zone).toBe('trash')
    expect(after.objects.drake?.damage).toBe(8)
    expect(after.objects.elsewhere?.damage).toBe(0)
    expect(after.objects.hammer?.location).toEqual(field('bf-1'))
  })

  it('OGN-252 Super Mega Death Rocket! deals 5 to a unit', () => {
    const after = cast(
      'OGN-252',
      [{ id: 'target', cardId: 'OGN-088', owner: 1, at: field('bf-0') }],
      'target',
    )
    expect(after.objects.target?.damage).toBe(5)
  })

  it('OGN-260 Last Breath readies a unit, which then hits an enemy for its Might', () => {
    const after = cast(
      'OGN-260',
      [
        { id: 'blade', cardId: 'OGN-219', owner: 0, at: base(0), exhausted: true }, // 4
        { id: 'foe', cardId: 'OGN-088', owner: 1, at: field('bf-0') }, // 8
      ],
      'blade',
      'foe',
    )
    expect(after.objects.blade).toMatchObject({ exhausted: false, damage: 0 })
    expect(after.objects.foe?.damage).toBe(4)
  })

  it('OGN-262 Zenith Blade stuns an enemy and may bring a friend to its battlefield', () => {
    const after = cast(
      'OGN-262',
      [
        { id: 'foe', cardId: 'OGN-088', owner: 1, at: field('bf-0') },
        { id: 'ally', cardId: 'OGN-219', owner: 0, at: base(0) },
      ],
      'foe',
      'ally',
    )
    // Stunned is a status, not an exhaust (423).
    expect(after.objects.foe).toMatchObject({ stunned: true, exhausted: false })
    expect(after.objects.ally?.location).toEqual(field('bf-0'))
  })

  it('OGN-266 Siphon Power shifts Might at one battlefield, to a minimum of 1', () => {
    const after = cast(
      'OGN-266',
      [
        { id: 'ally', cardId: 'OGN-219', owner: 0, at: field('bf-0') }, // 4
        { id: 'foe', cardId: 'OGN-088', owner: 1, at: field('bf-0') }, // 8
        { id: 'recruit', cardId: 'TOK-001', owner: 1, at: field('bf-0') }, // 1
        { id: 'away', cardId: 'OGN-219', owner: 1, at: field('bf-1') },
      ],
      'bf-0',
    )
    const might = (id: string) => {
      const object = after.objects[id]
      return object && mightOf(after, object, oracle)
    }
    expect(might('ally')).toBe(5)
    expect(might('foe')).toBe(7)
    expect(might('recruit')).toBe(1)
    expect(might('away')).toBe(4)
  })

  it('OGN-270 Showstopper buffs a unit in your base and sends it to a battlefield', () => {
    const after = cast(
      'OGN-270',
      [{ id: 'star', cardId: 'OGN-219', owner: 0, at: base(0) }],
      'star',
      'bf-1',
    )
    expect(after.objects.star).toMatchObject({ buffs: 1, location: field('bf-1') })
  })
})

describe('Stun (423)', () => {
  it('a Stunned unit deals no combat damage but still dies only to its full Might', () => {
    // Zenith Blade stuns the defender, then the attacker walks in.
    const start = mainPhase([
      { id: 'spell', cardId: 'OGN-262', owner: 0, at: 'hand' },
      { id: 'defender', cardId: 'OGN-088', owner: 1, at: field('bf-0') }, // 8
      { id: 'attacker', cardId: 'OGN-219', owner: 0, at: base(0) }, // 4
    ])
    const stunned = settle(
      act(start, { type: 'play-card', player: 0, card: 'spell' }),
      // Stun the defender, then decline to move anyone in.
      (candidates) => (candidates.includes('defender') ? ['defender'] : []),
    )
    expect(stunned.objects.defender?.stunned).toBe(true)

    const fought = fightOut(
      act(stunned, { type: 'move', player: 0, units: ['attacker'], to: field('bf-0') }),
    )
    // An 8 Might defender would have killed a 4 Might attacker. Stunned, it dealt
    // nothing: the attacker lives, and with the defender still there it is
    // recalled home (466.1.a.2) while the Combat Cleanup heals both (466.1.a.1).
    expect(fought.objects.attacker).toMatchObject({ zone: 'base', damage: 0 })
    expect(fought.objects.defender?.zone).toBe('battlefield')
  })

  it('wears off at the end of the turn', () => {
    const stunned = cast(
      'OGN-262',
      [{ id: 'foe', cardId: 'OGN-088', owner: 1, at: field('bf-0') }],
      'foe',
    )
    expect(stunned.objects.foe?.stunned).toBe(true)
    const next = act(stunned, { type: 'pass', player: 0 })
    expect(next.objects.foe?.stunned).toBeUndefined()
  })
})
