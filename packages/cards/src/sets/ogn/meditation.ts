import { defineCard } from '../../schema.js'

/**
 * OGN-048 — transcribed from the printed card.
 */
export default defineCard({
  id: 'OGN-048',
  set: 'ogn',
  name: 'Meditation',
  type: 'spell',
  domains: ['calm'],
  cost: { energy: 2, power: [] },
  keywords: ['reaction'],
  abilities: [
    {
      kind: 'spell',
      id: 'meditation-effect',
      steps: [
        {
          op: 'additional-cost',
          as: '$exhausted',
          exhaust: { kind: 'unit', controller: 'self', exhausted: false },
          optional: true,
        },
        {
          op: 'if',
          condition: { kind: 'chosen', binding: '$exhausted' },
          then: [{ op: 'draw', amount: 2 }],
          else: [{ op: 'draw', amount: 1 }],
        },
      ],
    },
  ],
  text: '[Reaction] (Play any time, even before spells and abilities resolve.) As an additional cost to play this, you may exhaust a friendly unit. If you do, draw 2. Otherwise, draw 1.',
})
