import { defineCard } from '../../schema.js'

/**
 * OGN-005 — transcribed from the printed card.
 */
export default defineCard({
  id: 'OGN-005',
  set: 'ogn',
  name: 'Disintegrate',
  type: 'spell',
  domains: ['fury'],
  cost: { energy: 4, power: [] },
  keywords: ['action'],
  abilities: [
    {
      kind: 'spell',
      id: 'disintegrate-effect',
      steps: [],
      notImplemented: 'the "if this kills it, draw 1" condition cannot be expressed yet',
    },
  ],
  text: '[Action] (Play on your turn or in showdowns.) Deal 3 to a unit at a battlefield. If this kills it, draw 1.',
  flavor: '"Ashes, ashes, they all fall down." —Annie',
})
