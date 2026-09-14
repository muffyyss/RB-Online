import { describe, expect, it } from 'vitest'

import card from '../src/sets/ogs/firestorm.js'
import { board, resolveSpell } from './support/play.js'

describe('OGS-002 Firestorm', () => {
  it('matches the printed card', () => {
    expect(card).toMatchObject({
      name: 'Firestorm',
      type: 'spell',
      domains: ['fury'],
      cost: { energy: 6, power: [{ kind: 'domain', domain: 'fury' }] },
    })
    // No timing keyword: main phase on its controller's turn only (310.1.a).
    expect(card.keywords).toBeUndefined()
  })

  const scene = () =>
    board([
      { id: 'enemy-a', cardId: 'OGS-001', owner: 1, at: 'bf-0' }, // 4 Might
      { id: 'enemy-b', cardId: 'OGS-014', owner: 1, at: 'bf-0' }, // 2 Might
      { id: 'mine', cardId: 'OGS-001', owner: 0, at: 'bf-0' },
      { id: 'enemy-elsewhere', cardId: 'OGS-001', owner: 1, at: 'bf-1' },
      { id: 'enemy-base', cardId: 'OGS-001', owner: 1, at: 'base' },
    ])

  it('deals 3 to every enemy unit at the chosen battlefield, and nothing else', () => {
    const result = resolveSpell(card, scene(), [['bf-0']])
    expect(result.state.objects['enemy-a']?.damage).toBe(3)
    expect(result.state.objects['enemy-b']?.zone).toBe('trash')
    expect(result.state.objects.mine?.damage).toBe(0)
    expect(result.state.objects['enemy-elsewhere']?.damage).toBe(0)
    expect(result.state.objects['enemy-base']?.damage).toBe(0)
  })

  it('lets the player pick either battlefield', () => {
    const result = resolveSpell(card, scene(), [['bf-1']])
    expect(result.state.objects['enemy-elsewhere']?.damage).toBe(3)
    expect(result.state.objects['enemy-a']?.damage).toBe(0)
  })
})
