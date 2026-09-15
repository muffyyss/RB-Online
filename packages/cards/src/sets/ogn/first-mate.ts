import { defineCard } from '../../schema.js'

/**
 * OGN-132 — transcribed from the printed card.
 */
export default defineCard({
  id: 'OGN-132',
  set: 'ogn',
  name: 'First Mate',
  type: 'unit',
  tags: ['Bilgewater', 'Pirate'],
  domains: ['body'],
  cost: { energy: 3, power: [] },
  might: 3,
  abilities: [
    {
      kind: 'triggered',
      id: 'first-mate-ready',
      on: 'played',
      steps: [
        { op: 'choose', as: '$unit', from: { kind: 'unit', other: true } },
        { op: 'ready', target: '$unit' },
      ],
    },
  ],
  text: 'When you play me, ready another unit.',
  flavor: '"It\'s a boarding party! Try to have some fun with it."',
})
