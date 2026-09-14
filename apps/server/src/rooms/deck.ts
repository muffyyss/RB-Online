/**
 * What a room checks about a deck.
 *
 * Only that the code is a deck code this version understands. Full legality —
 * card counts, domains, signature limits — needs the card data wired into the
 * engine's oracle, and is checked when the match is built (plan: "deck legality
 * is re-validated server-side at match start"). A room refusing a code that
 * does not even parse just catches the obvious mistake early.
 */

import { decodeDeck } from '@rb/engine'

import type { DeckCheck } from './manager.js'

export const checkDeckCode: DeckCheck = (code) => {
  const decoded = decodeDeck(code)
  if (decoded.ok) return null
  return decoded.error === 'wrong-version'
    ? 'That deck code is from a different version of the game.'
    : 'That is not a deck code.'
}
