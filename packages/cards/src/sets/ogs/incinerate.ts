import { defineCard } from '../../schema.js'

/**
 * OGS-003 — transcribed from the printed card.
 *
 * The [Action] keyword is what lets this be played during a Showdown (308.1.a);
 * without it the spell would be legal only in a Neutral Open state (310.1.a).
 */
export default defineCard({
  id: 'OGS-003',
  set: 'ogs',
  name: 'Incinerate',
  type: 'spell',
  domains: ['fury'],
  cost: { energy: 2, power: [] },
  keywords: ['action'],
  abilities: [
    {
      kind: 'spell',
      id: 'incinerate-effect',
      steps: [
        { op: 'choose', as: '$victim', from: { kind: 'unit', at: 'any-battlefield' } },
        // The tunable number lives here, alone on its own line.
        { op: 'deal', amount: 2, target: '$victim' },
      ],
    },
  ],
  text: '[Action] (Play on your turn or in showdowns.) Deal 2 to a unit at a battlefield.',
  flavor: 'You smell like burning! —Annie',
})
