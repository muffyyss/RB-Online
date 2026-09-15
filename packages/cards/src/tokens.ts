/**
 * Token definitions (185-187).
 *
 * Tokens are not cards: they have no cost or domains, and are created by
 * spells and abilities rather than drawn. They are kept apart from
 * `ALL_CARDS` so they never reach the deck builder or deck validation, but the
 * card oracle knows them, so a token on the board plays like any unit.
 */

import { defineCard } from './schema.js'
import type { CardDefinition } from './schema.js'

/** 187.1 - a 1 [M] Recruit token: a domainless unit token with the Recruit tag. */
export const RECRUIT = defineCard({
  id: 'TOK-001',
  set: 'tok',
  token: true,
  name: 'Recruit',
  type: 'unit',
  tags: ['Recruit'],
  domains: [],
  might: 1,
})

export const ALL_TOKENS: readonly CardDefinition[] = [RECRUIT]
