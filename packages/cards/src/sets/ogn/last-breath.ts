import { defineCard } from '../../schema.js'

/**
 * OGN-260 - transcribed from the printed card. Yasuo's Signature spell.
 *
 * Its [C] Power may be paid with either of its Domains (135.2.e.6.c).
 */
export default defineCard({
  id: 'OGN-260',
  set: 'ogn',
  name: 'Last Breath',
  type: 'spell',
  supertypes: ['signature'],
  tags: ['Yasuo'],
  domains: ['calm', 'chaos'],
  cost: { energy: 3, power: [{ kind: 'self' }, { kind: 'self' }] },
  keywords: ['action'],
  abilities: [
    {
      kind: 'spell',
      id: 'last-breath-effect',
      steps: [
        { op: 'choose', as: '$ally', from: { kind: 'unit', controller: 'self' } },
        { op: 'ready', target: '$ally' },
        {
          op: 'choose',
          as: '$foe',
          from: { kind: 'unit', controller: 'opponent', at: 'any-battlefield' },
        },
        // One way only: the enemy does not hit back.
        { op: 'deal', amount: { might: '$ally' }, target: '$foe' },
      ],
    },
  ],
  text: '[Action] (Play on your turn or in showdowns.) Ready a friendly unit. It deals damage equal to its Might to an enemy unit at a battlefield.',
})
