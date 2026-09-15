import { defineCard } from '../../schema.js'

/**
 * OGN-087 — transcribed from the printed card.
 */
export default defineCard({
  id: 'OGN-087',
  set: 'ogn',
  name: 'Lecturing Yordle',
  type: 'unit',
  tags: ['Bandle City', 'Yordle'],
  domains: ['mind'],
  cost: { energy: 3, power: [] },
  might: 2,
  keywords: ['tank'],
  abilities: [
    {
      kind: 'triggered',
      id: 'lecturing-yordle-draw',
      on: 'played',
      steps: [{ op: 'draw', amount: 1 }],
    },
  ],
  text: '[Tank] (I must be assigned combat damage first.) When you play me, draw 1.',
  flavor: '"... poisonous, but I didn\'t know that at the time. You see ..."',
})
