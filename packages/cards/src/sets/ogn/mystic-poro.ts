import { defineCard } from '../../schema.js'

/**
 * OGN-171 — transcribed from the printed card.
 */
export default defineCard({
  id: 'OGN-171',
  set: 'ogn',
  name: 'Mystic Poro',
  type: 'unit',
  tags: ['Poro'],
  domains: ['chaos'],
  cost: { energy: 2, power: [] },
  might: 2,
  keywords: ['vision'],
  text: '[Vision] (When you play me, look at the top card of your Main Deck. You may recycle it.)',
  flavor: 'Forecast: Sunny, with a chance of snax.',
})
