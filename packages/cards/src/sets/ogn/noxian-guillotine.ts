import { defineCard } from '../../schema.js'

/**
 * OGN-254 - transcribed from the printed card. Darius's Signature spell.
 *
 * Its [C] Power may be paid with either of its Domains (135.2.e.6.c).
 */
export default defineCard({
  id: 'OGN-254',
  set: 'ogn',
  name: 'Noxian Guillotine',
  type: 'spell',
  supertypes: ['signature'],
  tags: ['Darius'],
  domains: ['fury', 'order'],
  cost: { energy: 4, power: [{ kind: 'self' }] },
  keywords: ['action'],
  abilities: [
    {
      kind: 'spell',
      id: 'noxian-guillotine-effect',
      notImplemented: 'a delayed kill on taking damage, and Legion (812), are not modelled',
      steps: [
        { op: 'choose', as: '$unit', from: { kind: 'unit' } },
        { op: 'kill', target: '$unit' },
      ],
    },
  ],
  text: "[Action] (Play on your turn or in showdowns.) Choose a unit. Kill it the next time it takes damage this turn. [Legion] — Kill it now instead. (Get the effect if you've played another card this turn.)",
})
