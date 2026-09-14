import { describe, expect, it } from 'vitest'

import { beginExecution } from '@rb/engine'

import card from '../src/sets/ogs/blast-of-power.js'
import { board, resolveSpell, testOracle } from './support/play.js'

describe('OGS-012 Blast of Power', () => {
  it('matches the printed card', () => {
    expect(card).toMatchObject({
      name: 'Blast of Power',
      type: 'spell',
      domains: ['order'],
      cost: { energy: 6, power: [{ kind: 'domain', domain: 'order' }] },
      keywords: ['action'],
    })
  })

  const scene = () =>
    board([
      { id: 'big', cardId: 'OGS-018', owner: 1, at: 'bf-0' }, // Tibbers, 7 Might
      { id: 'at-base', cardId: 'OGS-001', owner: 1, at: 'base' },
    ])

  it('kills the chosen unit regardless of Might', () => {
    const result = resolveSpell(card, scene(), [['big']])
    expect(result.state.objects.big?.zone).toBe('trash')
  })

  it('never offers a unit in a base', () => {
    const effect = card.abilities?.find((a) => a.kind === 'spell')
    const started = beginExecution(
      scene(),
      { source: 'bf-1', controller: 0, steps: effect?.steps ?? [] },
      testOracle,
    )
    expect(started.state.pendingChoice?.candidates).toEqual(['big'])
  })
})
