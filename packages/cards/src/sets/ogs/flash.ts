import { defineCard } from '../../schema.js'

/**
 * OGS-011 — transcribed from the printed card.
 *
 * [Reaction] makes it playable at any time, even with the Chain open (813).
 * "Up to 2" is an optional choice of at most two; units already at base have
 * nowhere to move, so they are not offered.
 */
export default defineCard({
  id: 'OGS-011',
  set: 'ogs',
  name: 'Flash',
  type: 'spell',
  domains: ['chaos'],
  cost: { energy: 2, power: [] },
  keywords: ['reaction'],
  abilities: [
    {
      kind: 'spell',
      id: 'flash-effect',
      steps: [
        {
          op: 'choose',
          as: '$units',
          from: { kind: 'unit', controller: 'self', at: 'any-battlefield', count: 2 },
          optional: true,
        },
        { op: 'move', target: '$units', to: 'base' },
      ],
    },
  ],
  text: '[Reaction] (Play any time, even before spells and abilities resolve.) Move up to 2 friendly units to base.',
  flavor: "It's not running away. It's strategic repositioning.",
})
