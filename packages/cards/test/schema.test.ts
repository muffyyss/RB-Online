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

describe('card schema — keywords', () => {
  const unit = (keywords: unknown) => ({
    id: 'OGS-999',
    set: 'ogs',
    name: 'Test Unit',
    type: 'unit',
    domains: ['body'],
    cost: { energy: 2, power: [] },
    might: 2,
    keywords,
  })
  const accepts = (keywords: unknown) => cardDefinitionSchema.safeParse(unit(keywords)).success

  it('takes a value only on a valued keyword, as printed ("[Assault 2]")', () => {
    expect(accepts([['assault', 2], 'tank'])).toBe(true)
    expect(accepts(['shield'])).toBe(true) // [Shield] is Shield 1
    expect(accepts([['tank', 2]])).toBe(false)
  })

  it('rejects the same keyword listed twice', () => {
    expect(accepts(['assault', ['assault', 2]])).toBe(false)
  })

  it('rejects a keyword the engine does not implement', () => {
    expect(accepts(['deflect'])).toBe(false)
  })
})
