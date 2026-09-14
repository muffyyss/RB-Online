import { describe, expect, it } from 'vitest'

import { cardDefinitionSchema } from '../src/schema.js'

const spell = (ability: Record<string, unknown>) => ({
  id: 'OGS-999',
  set: 'ogs',
  name: 'Test Spell',
  type: 'spell',
  domains: ['fury'],
  cost: { energy: 1, power: [] },
  abilities: [{ kind: 'spell', id: 'test-effect', ...ability }],
})

describe('card schema — abilities with no steps', () => {
  it('rejects an empty ability that does not say why', () => {
    // A card that silently does nothing is worse than one that refuses to load.
    const parsed = cardDefinitionSchema.safeParse(spell({ steps: [] }))
    expect(parsed.success).toBe(false)
  })

  it('accepts an empty ability marked notImplemented', () => {
    const parsed = cardDefinitionSchema.safeParse(
      spell({ steps: [], notImplemented: 'waiting on something' }),
    )
    expect(parsed.success).toBe(true)
  })
})
