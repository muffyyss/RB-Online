import { defineCard } from '../../schema.js'

/**
 * OGN-258 - transcribed from the printed card. Lee Sin's Signature spell.
 *
 * Its [C] Power may be paid with either of its Domains (135.2.e.6.c).
 */
export default defineCard({
  id: 'OGN-258',
  set: 'ogn',
  name: "Dragon's Rage",
  type: 'spell',
  supertypes: ['signature'],
  tags: ['Lee Sin'],
  domains: ['body', 'calm'],
  cost: { energy: 4, power: [{ kind: 'self' }] },
  abilities: [
    {
      kind: 'spell',
      id: 'dragons-rage-effect',
      notImplemented:
        "moving an enemy unit to a Destination of the caster's choosing, base included, is not modelled",
      steps: [
        { op: 'choose', as: '$foe', from: { kind: 'unit', controller: 'opponent' } },
        {
          op: 'choose',
          as: '$other',
          from: { kind: 'unit', controller: 'opponent', at: '$foe', other: true },
        },
        { op: 'deal-each-other', a: '$foe', b: '$other' },
      ],
    },
  ],
  text: 'Move an enemy unit. Then choose another enemy unit at its destination. They deal damage equal to their Mights to each other.',
})
