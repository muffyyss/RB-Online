import { defineCard } from '../../schema.js'

/**
 * OGN-248 - transcribed from the printed card. Kai’Sa's Signature spell.
 *
 * Its [C] Power may be paid with either of its Domains (135.2.e.6.c).
 */
export default defineCard({
  id: 'OGN-248',
  set: 'ogn',
  name: 'Icathian Rain',
  type: 'spell',
  supertypes: ['signature'],
  tags: ['Kai’Sa'],
  domains: ['fury', 'mind'],
  cost: { energy: 7, power: [{ kind: 'self' }, { kind: 'self' }, { kind: 'self' }] },
  abilities: [
    {
      kind: 'spell',
      id: 'icathian-rain-effect',
      steps: [
        {
          op: 'repeat',
          times: 6,
          // A new choice each time, so the same unit may be picked again or not.
          steps: [
            { op: 'choose', as: '$unit', from: { kind: 'unit' } },
            { op: 'deal', amount: 2, target: '$unit' },
          ],
        },
      ],
    },
  ],
  text: 'Do this 6 times: Deal 2 to a unit. (You can choose different units.)',
})
