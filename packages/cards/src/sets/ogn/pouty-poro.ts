import { defineCard } from '../../schema.js'

/**
 * OGN-013 — transcribed from the printed card.
 */
export default defineCard({
  id: 'OGN-013',
  set: 'ogn',
  name: 'Pouty Poro',
  type: 'unit',
  tags: ['Poro'],
  domains: ['fury'],
  cost: { energy: 2, power: [] },
  might: 2,
  keywords: ['deflect'],
  text: '[Deflect] (Opponents must pay [A] to choose me with a spell or ability.)',
  flavor: '"Braum takes medicine too, see?" —Braum',
})
