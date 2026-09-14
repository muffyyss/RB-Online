import { describe, expect, it } from 'vitest'

import { beginExecution } from '@rb/engine'

import card from '../src/sets/ogs/final-spark.js'
import { board, resolveSpell, testOracle } from './support/play.js'

describe('OGS-022 Final Spark', () => {
  it('matches the printed card', () => {
    expect(card).toMatchObject({
      name: 'Final Spark',
      type: 'spell',
      supertypes: ['signature'],
      tags: ['Lux'],
      domains: ['mind', 'order'],
      cost: { energy: 8, power: [] },
      keywords: ['action'],
    })
  })

  it('deals 8 to the chosen unit', () => {
    const scene = board([{ id: 'tibbers', cardId: 'OGS-018', owner: 1, at: 'bf-0' }])
    const result = resolveSpell(card, scene, [['tibbers']])
    expect(result.state.objects.tibbers?.zone).toBe('trash')
  })

  it('can target a unit in a base, and either player’s', () => {
    const scene = board([
      { id: 'enemy-base', cardId: 'OGS-001', owner: 1, at: 'base' },
      { id: 'mine', cardId: 'OGS-001', owner: 0, at: 'bf-1' },
    ])
    const effect = card.abilities?.find((a) => a.kind === 'spell')
    const started = beginExecution(
      scene,
      { source: 'bf-0', controller: 0, steps: effect?.steps ?? [] },
      testOracle,
    )
    expect(started.state.pendingChoice?.candidates).toEqual(
      expect.arrayContaining(['enemy-base', 'mine']),
    )
  })
})
