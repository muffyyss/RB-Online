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
      steps: [
        { op: 'choose', as: '$victim', from: { kind: 'unit', at: 'any-battlefield' } },
        { op: 'deal', amount: 3, target: '$victim' },
        {
          op: 'if',
          condition: { kind: 'left-board', target: '$victim' },
          then: [{ op: 'draw', amount: 1 }],
        },
      ],
    },
  ],
  text: '[Action] (Play on your turn or in showdowns.) Deal 3 to a unit at a battlefield. If this kills it, draw 1.',
  flavor: '"Ashes, ashes, they all fall down." —Annie',
})
