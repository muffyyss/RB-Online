import { defineCard } from '../../schema.js'

/**
 * OGN-046 — transcribed from the printed card.
 */
export default defineCard({
  id: 'OGN-046',
  set: 'ogn',
  name: 'En Garde',
  type: 'spell',
  domains: ['calm'],
  cost: { energy: 1, power: [] },
  keywords: ['reaction'],
  abilities: [
    {
      kind: 'spell',
      id: 'en-garde-effect',
      steps: [
        { op: 'choose', as: '$unit', from: { kind: 'unit', controller: 'self' } },
        { op: 'give-might', amount: 1, target: '$unit', duration: 'this-turn' },
        {
          op: 'if',
          // Counting it too: "the only unit you control there" is a count of 1.
          condition: {
            kind: 'count',
            of: { kind: 'unit', controller: 'self', at: '$unit' },
            atMost: 1,
          },
          then: [{ op: 'give-might', amount: 1, target: '$unit', duration: 'this-turn' }],
        },
      ],
    },
  ],
  text: '[Reaction] (Play any time, even before spells and abilities resolve.) Give a friendly unit +1 [Might] this turn, then an additional +1 [Might] this turn if it is the only unit you control there.',
  flavor: '"Is this supposed to be a challenge?" —Fiora',
})
