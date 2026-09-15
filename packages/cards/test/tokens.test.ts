import { describe, expect, it } from 'vitest'

import { validateDeck } from '@rb/engine'

import { cardOracle } from '../src/oracle.js'
import { ALL_CARDS, getCard } from '../src/registry.js'
import { cardDefinitionSchema } from '../src/schema.js'
import { RECRUIT } from '../src/tokens.js'
import { PROVING_GROUNDS_DECKS } from '../src/decks/proving-grounds.js'

describe('tokens (185-187)', () => {
  it('defines the 1 Might Recruit token as printed in 187.1', () => {
    expect(RECRUIT).toMatchObject({
      id: 'TOK-001',
      token: true,
      type: 'unit',
      tags: ['Recruit'],
      domains: [],
      might: 1,
    })
    expect(RECRUIT.cost).toBeUndefined()
  })

  it('is known to the oracle and by id, but is not a card in the collection', () => {
    expect(cardOracle().facts('TOK-001')).toMatchObject({ type: 'unit', might: 1, token: true })
    expect(getCard('TOK-001')).toBe(RECRUIT)
    expect(ALL_CARDS.some((card) => card.id === 'TOK-001')).toBe(false)
  })

  it('cannot go in a deck (185.1)', () => {
    const starter = PROVING_GROUNDS_DECKS[0]
    if (!starter) throw new Error('no deck')
    const withToken = { ...starter.deck, main: ['TOK-001', ...starter.deck.main.slice(1)] }
    expect(validateDeck(starter.deck, cardOracle(), starter.format).errors).toEqual([])
    const result = validateDeck(withToken, cardOracle(), starter.format)
    expect(result.errors).toContainEqual(expect.objectContaining({ card: 'TOK-001' }))
  })

  it('refuses a token with a cost or domains, or one outside the token set', () => {
    const base = { ...RECRUIT }
    expect(cardDefinitionSchema.safeParse(base).success).toBe(true)
    expect(
      cardDefinitionSchema.safeParse({ ...base, cost: { energy: 1, power: [] } }).success,
    ).toBe(false)
    expect(cardDefinitionSchema.safeParse({ ...base, domains: ['order'] }).success).toBe(false)
    expect(cardDefinitionSchema.safeParse({ ...base, set: 'ogn' }).success).toBe(false)
  })
})
