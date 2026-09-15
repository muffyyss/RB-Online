import { defineCard } from '../../schema.js'

/**
 * OGN-127 — transcribed from the printed card.
 */
export default defineCard({
  id: 'OGN-127',
  set: 'ogn',
  name: 'Cannon Barrage',
  type: 'spell',
  domains: ['body'],
  cost: { energy: 2, power: [{ kind: 'domain', domain: 'body' }] },
  keywords: ['reaction'],
  abilities: [
    {
      kind: 'spell',
      id: 'cannon-barrage-effect',
      steps: [
        {
          op: 'for-each',
          of: { kind: 'unit', controller: 'opponent', inCombat: true },
          as: '$enemy',
          steps: [{ op: 'deal', amount: 2, target: '$enemy' }],
        },
      ],
    },
  ],
  text: '[Reaction] (Play any time, even before spells and abilities resolve.) Deal 2 to all enemy units in combat.',
  flavor: "If you've got enough guns, you don't need to aim.",
})
