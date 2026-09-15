/**
 * What a room checks about a deck.
 *
 * Everything: the code must decode, and the deck must be legal against the card
 * data the server holds, in either the Duel format or the starter format the
 * boxed Proving Grounds decks use. Checking at the door rather than when the
 * match is built means nobody readies up with a deck that could never start.
 *
 * The client runs the same validator in its deck builder, but this is the check
 * that counts: a modified client can send any code it likes.
 */

import { cardOracle } from '@rb/cards'
import { decodeDeck, validateDeck } from '@rb/engine'
import type { DeckFormat, DeckList } from '@rb/engine'

import type { DeckCheck } from './manager.js'

const oracle = cardOracle()

/** The format a deck is legal in, preferring Duel, or null if neither. */
export function legalFormat(deck: DeckList): DeckFormat | null {
  if (validateDeck(deck, oracle, 'duel').valid) return 'duel'
  if (validateDeck(deck, oracle, 'starter').valid) return 'starter'
  return null
}

export const checkDeckCode: DeckCheck = (code) => {
  const decoded = decodeDeck(code)
  if (!decoded.ok) {
    return decoded.error === 'wrong-version'
      ? 'That deck code is from a different version of the game.'
      : 'That is not a deck code.'
  }
  if (legalFormat(decoded.deck)) return null
  // Report the Duel problems: they are the ones a player can act on, and for a
  // one-battlefield deck the only extra one is the battlefield count.
  const first = validateDeck(decoded.deck, oracle, 'duel').errors[0]
  return first ? `That deck is not legal: ${first.message}.` : 'That deck is not legal.'
}
