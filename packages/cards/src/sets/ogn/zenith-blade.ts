import { defineCard } from '../../schema.js'

/**
 * OGN-262 - transcribed from the printed card. Leona's Signature spell.
 *
 * Its [C] Power may be paid with either of its Domains (135.2.e.6.c).
 */
export default defineCard({
  id: 'OGN-262',
  set: 'ogn',
  name: 'Zenith Blade',
  type: 'spell',
  supertypes: ['signature'],
  tags: ['Leona'],
  domains: ['calm', 'order'],
  cost: { energy: 3, power: [{ kind: 'self' }, { kind: 'self' }] },
  keywords: ['action'],
  abilities: [
    {
      kind: 'spell',
      id: 'zenith-blade-effect',
      steps: [
        {
          op: 'choose',
          as: '$foe',
          from: { kind: 'unit', controller: 'opponent', at: 'any-battlefield' },
        },
        { op: 'stun', target: '$foe' },
        {
          op: 'may',
          steps: [
            { op: 'choose', as: '$ally', from: { kind: 'unit', controller: 'self' } },
            // "That enemy unit's battlefield": wherever the stunned unit stands.
            { op: 'move', target: '$ally', to: '$foe' },
          ],
        },
      ],
    },
  ],
  text: "[Action] (Play on your turn or in showdowns.) Stun an enemy unit at a battlefield. You may move a friendly unit to that enemy unit's battlefield. (A stunned unit doesn't deal combat damage this turn.)",
})
