import { describe, expect, it } from 'vitest'

import card from '../src/sets/ogs/garen-commander.js'
import { mightOf } from '@rb/engine'

import { act, base, field, mainPhase, oracle, settle } from './support/game.js'

describe('OGS-013 Garen, Commander', () => {
  it('matches the printed card', () => {
    expect(card).toMatchObject({
      name: 'Garen',
      subtitle: 'Commander',
      type: 'unit',
      supertypes: ['champion'],
      tags: ['Garen', 'Demacia', 'Elite'],
      domains: ['order'],
      cost: { energy: 6, power: [{ kind: 'domain', domain: 'order' }] },
      might: 5,
    })
  })

  const scene = () =>
    mainPhase([
      { id: 'garen', cardId: 'OGS-013', owner: 0, at: field('bf-0') },
      { id: 'beside', cardId: 'OGN-219', owner: 0, at: field('bf-0') }, // 4 Might
      { id: 'home', cardId: 'OGN-219', owner: 0, at: base(0) },
      { id: 'foe', cardId: 'OGN-219', owner: 1, at: field('bf-0') },
      { id: 'blast', cardId: 'OGS-012', owner: 0, at: 'hand' }, // Kill a unit at a battlefield
    ])
  const might = (state: ReturnType<typeof scene>, id: string) => {
    const object = state.objects[id]
    return object && mightOf(state, object, oracle)
  }

  it('gives other friendly units at his location +1 Might, and no one else', () => {
    const state = scene()
    expect(might(state, 'beside')).toBe(5)
    expect(might(state, 'garen')).toBe(5) // "other"
    expect(might(state, 'home')).toBe(4) // not here
    expect(might(state, 'foe')).toBe(4) // not friendly
  })

  it('stops when he leaves, and a unit then under lethal damage dies (323.5)', () => {
    const start = scene()
    const beside = start.objects.beside
    if (!beside) throw new Error('missing unit')
    const hurt = { ...start, objects: { ...start.objects, beside: { ...beside, damage: 4 } } }
    expect(might(hurt, 'beside')).toBe(5) // alive, just

    const after = settle(act(hurt, { type: 'play-card', player: 0, card: 'blast' }), () => [
      'garen',
    ])
    expect(after.objects.garen?.zone).toBe('trash')
    expect(after.objects.beside?.zone).toBe('trash')
  })
})
