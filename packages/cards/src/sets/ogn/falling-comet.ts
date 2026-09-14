import { defineCard } from '../../schema.js'

/**
 * OGN-085 — transcribed from the printed card.
 */
export default defineCard({
  id: 'OGN-085',
  set: 'ogn',
  name: 'Falling Comet',
  type: 'spell',
  domains: ['mind'],
  cost: { energy: 5, power: [] },
  keywords: ['action'],
  abilities: [
    {
      kind: 'spell',
      id: 'falling-comet-effect',
      steps: [
        { op: 'choose', as: '$victim', from: { kind: 'unit', at: 'any-battlefield' } },
        { op: 'deal', amount: 6, target: '$victim' },
      ],
    },
  ],
  text: '[Action] (Play on your turn or in showdowns.) Deal 6 to a unit at a battlefield.',
  flavor: 'Just an everyday celestial event.',
})
