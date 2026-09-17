import { defineCard } from '../../schema.js'

/**
 * OGN-282 - transcribed from the printed card.
 */
export default defineCard({
  id: 'OGN-282',
  set: 'ogn',
  name: 'Monastery of Hirana',
  type: 'battlefield',
  domains: [],
  abilities: [
    {
      kind: 'triggered',
      id: 'monastery-of-hirana-draw',
      on: 'conquer',
      notImplemented: 'spending a Buff as a cost is not an effect step',
      steps: [{ op: 'may', steps: [{ op: 'draw', amount: 1 }] }],
    },
  ],
  text: 'When you conquer here, you may spend a buff to draw 1.',
})
