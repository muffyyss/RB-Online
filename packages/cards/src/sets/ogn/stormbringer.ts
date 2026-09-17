import { defineCard } from '../../schema.js'

/**
 * OGN-250 - transcribed from the printed card. Volibear's Signature spell.
 *
 * Its [C] Power may be paid with either of its Domains (135.2.e.6.c).
 */
export default defineCard({
  id: 'OGN-250',
  set: 'ogn',
  name: 'Stormbringer',
  type: 'spell',
  supertypes: ['signature'],
  tags: ['Volibear'],
  domains: ['body', 'fury'],
  cost: { energy: 6, power: [{ kind: 'self' }, { kind: 'self' }] },
  abilities: [
    {
      kind: 'spell',
      id: 'stormbringer-effect',
      steps: [
        { op: 'choose', as: '$unit', from: { kind: 'unit', controller: 'self', at: 'base' } },
        { op: 'choose', as: '$field', from: { kind: 'battlefield' } },
        {
          op: 'for-each',
          of: { kind: 'unit', controller: 'opponent', at: '$field' },
          as: '$foe',
          // Its Might as it is now, for each enemy in turn.
          steps: [{ op: 'deal', amount: { might: '$unit' }, target: '$foe' }],
        },
        { op: 'move', target: '$unit', to: '$field' },
      ],
    },
  ],
  text: 'Choose a friendly unit in your base. Deal damage equal to its Might to all enemy units at a battlefield, then move your unit there.',
})
