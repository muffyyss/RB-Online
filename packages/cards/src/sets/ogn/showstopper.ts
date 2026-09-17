import { defineCard } from '../../schema.js'

/**
 * OGN-270 - transcribed from the printed card. Sett's Signature spell.
 *
 * Its [C] Power may be paid with either of its Domains (135.2.e.6.c).
 */
export default defineCard({
  id: 'OGN-270',
  set: 'ogn',
  name: 'Showstopper',
  type: 'spell',
  supertypes: ['signature'],
  tags: ['Sett'],
  domains: ['body', 'order'],
  cost: { energy: 1, power: [{ kind: 'self' }] },
  abilities: [
    {
      kind: 'spell',
      id: 'showstopper-effect',
      steps: [
        { op: 'choose', as: '$ally', from: { kind: 'unit', controller: 'self', at: 'base' } },
        { op: 'buff', amount: 1, target: '$ally' },
        { op: 'choose', as: '$field', from: { kind: 'battlefield' } },
        { op: 'move', target: '$ally', to: '$field' },
      ],
    },
  ],
  text: "Buff a friendly unit in your base, then move it to a battlefield. (If it doesn't have a buff, it gets a +1 [Might] buff.)",
})
