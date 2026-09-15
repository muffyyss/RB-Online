import { defineCard } from '../../schema.js'

/**
 * OGN-129 — transcribed from the printed card.
 */
export default defineCard({
  id: 'OGN-129',
  set: 'ogn',
  name: 'Confront',
  type: 'spell',
  domains: ['body'],
  cost: { energy: 2, power: [] },
  keywords: ['action'],
  abilities: [
    {
      kind: 'spell',
      id: 'confront-effect',
      steps: [
        { op: 'units-enter-ready', duration: 'this-turn' },
        { op: 'draw', amount: 1 },
      ],
    },
  ],
  text: '[Action] (Play on your turn or in showdowns.) Units you play this turn enter ready. Draw 1.',
  flavor: 'Now is the only moment that matters.',
})
