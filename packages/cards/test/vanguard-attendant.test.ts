import { describe, expect, it } from 'vitest'

import card from '../src/sets/ogs/vanguard-attendant.js'
import { applyAction } from '@rb/engine'

import { act, mainPhase, oracle, settle } from './support/game.js'

describe('OGS-016 Vanguard Attendant', () => {
  it('matches the printed card', () => {
    expect(card).toMatchObject({
      name: 'Vanguard Attendant',
      type: 'unit',
      tags: ['Demacia', 'Elite'],
      domains: ['order'],
      cost: { energy: 6, power: [{ kind: 'domain', domain: 'order' }] },
      might: 5,
    })
    expect(card.supertypes).toBeUndefined()
  })

  it('enters ready, where a unit without it enters exhausted (143.4)', () => {
    const start = mainPhase([
      { id: 'attendant', cardId: 'OGS-016', owner: 0, at: 'hand' },
      { id: 'plain', cardId: 'OGN-219', owner: 0, at: 'hand' },
    ])
    const one = settle(act(start, { type: 'play-card', player: 0, card: 'attendant' }))
    const both = settle(act(one, { type: 'play-card', player: 0, card: 'plain' }))
    expect(both.objects.attendant).toMatchObject({ zone: 'base', exhausted: false })
    expect(both.objects.plain).toMatchObject({ zone: 'base', exhausted: true })
  })

  it('does not become ready: nothing that cares about readying sees it (805.6.a)', () => {
    const start = mainPhase([{ id: 'attendant', cardId: 'OGS-016', owner: 0, at: 'hand' }])
    const played = applyAction(start, { type: 'play-card', player: 0, card: 'attendant' }, oracle)
    if (!played.ok) throw new Error(played.error.message)
    const events = [...played.events]
    let state = played.state
    while (state.chain.length > 0) {
      const passed = applyAction(state, { type: 'pass', player: state.priority ?? 0 }, oracle)
      if (!passed.ok) throw new Error(passed.error.message)
      events.push(...passed.events)
      state = passed.state
    }
    expect(state.objects.attendant?.exhausted).toBe(false)
    expect(events).not.toContainEqual({ type: 'readied', target: 'attendant' })
  })
})
