import { defineCard } from '../../schema.js'

/**
 * OGN-280 - transcribed from the printed card.
 */
export default defineCard({
  id: 'OGN-280',
  set: 'ogn',
  name: 'Grove of the God-Willow',
  type: 'battlefield',
  domains: [],
  abilities: [
    {
      kind: 'triggered',
      id: 'grove-of-the-god-willow-draw',
      on: 'hold',
      steps: [{ op: 'draw', amount: 1 }],
    },
  ],
  text: 'When you hold here, draw 1.',
})
