import { defineCard } from '../../schema.js'

/**
 * OGN-285 - transcribed from the printed card.
 */
export default defineCard({
  id: 'OGN-285',
  set: 'ogn',
  name: "Reaver's Row",
  type: 'battlefield',
  domains: [],
  abilities: [
    {
      kind: 'triggered',
      id: 'reavers-row-retreat',
      on: 'defend',
      steps: [
        {
          op: 'may',
          steps: [
            { op: 'choose', as: '$ally', from: { kind: 'unit', controller: 'self', at: 'here' } },
            { op: 'move', target: '$ally', to: 'base' },
          ],
        },
      ],
    },
  ],
  text: 'When you defend here, you may move a friendly unit here to base.',
})
