import { defineCard } from '../../schema.js'

/**
 * OGN-268 - transcribed from the printed card. Miss Fortune's Signature spell.
 *
 * Its [C] Power may be paid with either of its Domains (135.2.e.6.c).
 */
export default defineCard({
  id: 'OGN-268',
  set: 'ogn',
  name: 'Bullet Time',
  type: 'spell',
  supertypes: ['signature'],
  tags: ['Miss Fortune'],
  domains: ['body', 'chaos'],
  cost: { energy: 1, power: [] },
  keywords: ['action'],
  abilities: [
    {
      kind: 'spell',
      id: 'bullet-time-effect',
      notImplemented: 'paying a chosen amount of Power as the damage is not modelled',
      steps: [
        { op: 'choose', as: '$field', from: { kind: 'battlefield' } },
        {
          op: 'for-each',
          of: { kind: 'unit', controller: 'opponent', at: '$field' },
          as: '$foe',
          steps: [{ op: 'deal', amount: 1, target: '$foe' }],
        },
      ],
    },
  ],
  text: '[Action] (Play on your turn or in showdowns.) Pay any amount of [A] to deal that much damage to all enemy units at a battlefield.',
})
