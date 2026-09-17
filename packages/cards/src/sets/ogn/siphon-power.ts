import { defineCard } from '../../schema.js'

/**
 * OGN-266 - transcribed from the printed card. Viktor's Signature spell.
 *
 * Its [C] Power may be paid with either of its Domains (135.2.e.6.c).
 */
export default defineCard({
  id: 'OGN-266',
  set: 'ogn',
  name: 'Siphon Power',
  type: 'spell',
  supertypes: ['signature'],
  tags: ['Viktor'],
  domains: ['mind', 'order'],
  cost: { energy: 2, power: [{ kind: 'self' }] },
  keywords: ['reaction'],
  abilities: [
    {
      kind: 'spell',
      id: 'siphon-power-effect',
      steps: [
        { op: 'choose', as: '$field', from: { kind: 'battlefield' } },
        {
          op: 'for-each',
          of: { kind: 'unit', controller: 'self', at: '$field' },
          as: '$ally',
          steps: [{ op: 'give-might', amount: 1, target: '$ally', duration: 'this-turn' }],
        },
        {
          op: 'for-each',
          of: { kind: 'unit', controller: 'opponent', at: '$field' },
          as: '$foe',
          steps: [
            {
              op: 'give-might',
              amount: -1,
              target: '$foe',
              duration: 'this-turn',
              minimum: 1,
            },
          ],
        },
      ],
    },
  ],
  text: '[Reaction] (Play any time, even before spells and abilities resolve.) Choose a battlefield. Give friendly units there +1 [Might] this turn and enemy units there -1 [Might] this turn, to a minimum of 1 [Might].',
})
