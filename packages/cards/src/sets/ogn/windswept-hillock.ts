import { defineCard } from '../../schema.js'

/**
 * OGN-297 - transcribed from the printed card.
 */
export default defineCard({
  id: 'OGN-297',
  set: 'ogn',
  name: 'Windswept Hillock',
  type: 'battlefield',
  domains: [],
  abilities: [
    {
      kind: 'passive',
      id: 'windswept-hillock-ganking',
      text: 'Units here have [Ganking].',
      // Whoever controls them: the Battlefield says "units here" (810).
      effect: { kind: 'keyword', keyword: 'ganking', to: { kind: 'unit', at: 'here' } },
    },
  ],
  text: 'Units here have [Ganking]. (They can move from battlefield to battlefield.)',
})
