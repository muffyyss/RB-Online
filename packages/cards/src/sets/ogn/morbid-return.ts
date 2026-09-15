import { defineCard } from '../../schema.js'

/**
 * OGN-170 — transcribed from the printed card.
 */
export default defineCard({
  id: 'OGN-170',
  set: 'ogn',
  name: 'Morbid Return',
  type: 'spell',
  domains: ['chaos'],
  cost: { energy: 2, power: [] },
  keywords: ['action'],
  abilities: [
    {
      kind: 'spell',
      id: 'morbid-return-effect',
      steps: [
        { op: 'choose', as: '$unit', from: { kind: 'unit', controller: 'self', zone: 'trash' } },
        { op: 'return-to-hand', target: '$unit' },
      ],
    },
  ],
  text: '[Action] (Play on your turn or in showdowns.) Return a unit from your trash to your hand.',
  flavor: '"Soon, this long cruel night will end. But not yet." —Viego',
})
