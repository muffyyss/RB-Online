import { defineCard } from '../../schema.js'

/**
 * OGS-022 — transcribed from the printed card. Lux's Signature spell.
 *
 * "A unit" with no location: any unit on the board, at a base or a
 * battlefield, either player's.
 */
export default defineCard({
  id: 'OGS-022',
  set: 'ogs',
  name: 'Final Spark',
  type: 'spell',
  supertypes: ['signature'],
  tags: ['Lux'],
  domains: ['mind', 'order'],
  cost: { energy: 8, power: [] },
  keywords: ['action'],
  abilities: [
    {
      kind: 'spell',
      id: 'final-spark-effect',
      steps: [
        { op: 'choose', as: '$victim', from: { kind: 'unit' } },
        { op: 'deal', amount: 8, target: '$victim' },
      ],
    },
  ],
  text: '[Action] (Play on your turn or in showdowns.) Deal 8 to a unit.',
})
