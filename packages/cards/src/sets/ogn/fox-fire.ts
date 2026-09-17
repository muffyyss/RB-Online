import { defineCard } from '../../schema.js'

/**
 * OGN-256 - transcribed from the printed card. Ahri's Signature spell.
 *
 * Its [C] Power may be paid with either of its Domains (135.2.e.6.c).
 */
export default defineCard({
  id: 'OGN-256',
  set: 'ogn',
  name: 'Fox-Fire',
  type: 'spell',
  supertypes: ['signature'],
  tags: ['Ahri'],
  domains: ['calm', 'mind'],
  cost: { energy: 3, power: [] },
  keywords: ['action'],
  abilities: [
    {
      kind: 'spell',
      id: 'fox-fire-effect',
      notImplemented: 'choosing units by their total Might, and Hidden (811), are not modelled',
      steps: [
        { op: 'choose', as: '$unit', from: { kind: 'unit', at: 'any-battlefield' } },
        { op: 'kill', target: '$unit' },
      ],
    },
  ],
  text: '[Hidden] (Hide now for [A] to react with later for [0].) [Action] (Play on your turn or in showdowns.) Kill any number of units at a battlefield with total Might 4 or less.',
})
