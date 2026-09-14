import { defineCard } from '../../schema.js'

/**
 * OGN-176 — transcribed from the printed card.
 */
export default defineCard({
  id: 'OGN-176',
  set: 'ogn',
  name: 'Sneaky Deckhand',
  type: 'unit',
  tags: ['Bilgewater', 'Pirate'],
  domains: ['chaos'],
  cost: { energy: 3, power: [] },
  might: 2,
  abilities: [
    {
      kind: 'passive',
      id: 'sneaky-deckhand-open-battlefield',
      text: 'You may play me to an open battlefield.',
      notImplemented: 'playing a unit anywhere but base is not implemented',
    },
  ],
  text: 'You may play me to an open battlefield.',
  flavor: '"I like to think of her as a pre-boarding party." —Miss Fortune',
})
