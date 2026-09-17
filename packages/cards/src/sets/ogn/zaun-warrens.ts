import { defineCard } from '../../schema.js'

/**
 * OGN-298 - transcribed from the printed card.
 */
export default defineCard({
  id: 'OGN-298',
  set: 'ogn',
  name: 'Zaun Warrens',
  type: 'battlefield',
  domains: [],
  abilities: [
    {
      kind: 'triggered',
      id: 'zaun-warrens-cycle',
      on: 'conquer',
      steps: [
        { op: 'choose', as: '$card', from: { kind: 'card', controller: 'self', zone: 'hand' } },
        { op: 'discard', target: '$card' },
        { op: 'draw', amount: 1 },
      ],
    },
  ],
  text: 'When you conquer here, discard 1, then draw 1.',
})
