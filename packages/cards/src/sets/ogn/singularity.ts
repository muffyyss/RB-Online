import { defineCard } from '../../schema.js'

/**
 * OGN-105 — transcribed from the printed card.
 */
export default defineCard({
  id: 'OGN-105',
  set: 'ogn',
  name: 'Singularity',
  type: 'spell',
  domains: ['mind'],
  cost: {
    energy: 6,
    power: [
      { kind: 'domain', domain: 'mind' },
      { kind: 'domain', domain: 'mind' },
    ],
  },
  abilities: [
    {
      kind: 'spell',
      id: 'singularity-effect',
      steps: [
        { op: 'choose', as: '$targets', from: { kind: 'unit', count: 2 }, optional: true },
        { op: 'deal', amount: 6, target: '$targets' },
      ],
    },
  ],
  text: 'Deal 6 to each of up to two units.',
  flavor: 'Two fates, very briefly intertwined.',
})
