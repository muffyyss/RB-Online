import { defineCard } from '../../schema.js'

/**
 * OGN-169 — transcribed from the printed card.
 */
export default defineCard({
  id: 'OGN-169',
  set: 'ogn',
  name: 'Gust',
  type: 'spell',
  domains: ['chaos'],
  cost: { energy: 1, power: [] },
  keywords: ['reaction'],
  abilities: [
    {
      kind: 'spell',
      id: 'gust-effect',
      steps: [
        {
          op: 'choose',
          as: '$unit',
          from: { kind: 'unit', at: 'any-battlefield', might: { max: 3 } },
        },
        { op: 'return-to-hand', target: '$unit' },
      ],
    },
  ],
  text: "[Reaction] (Play any time, even before spells and abilities resolve.) Return a unit at a battlefield with 3 [Might] or less to its owner's hand.",
})
