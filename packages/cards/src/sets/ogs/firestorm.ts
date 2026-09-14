import { defineCard } from '../../schema.js'

/**
 * OGS-002 — transcribed from the printed card.
 *
 * "At a battlefield" is one Battlefield, chosen: the player picks it, then
 * every enemy unit there takes 3. Units elsewhere, and their own units, are
 * untouched. No timing keyword, so it is played in a Neutral Open state on
 * its controller's turn (310.1.a).
 */
export default defineCard({
  id: 'OGS-002',
  set: 'ogs',
  name: 'Firestorm',
  type: 'spell',
  domains: ['fury'],
  cost: { energy: 6, power: [{ kind: 'domain', domain: 'fury' }] },
  abilities: [
    {
      kind: 'spell',
      id: 'firestorm-effect',
      steps: [
        { op: 'choose', as: '$field', from: { kind: 'battlefield' } },
        {
          op: 'for-each',
          of: { kind: 'unit', controller: 'opponent', at: '$field' },
          as: '$unit',
          steps: [{ op: 'deal', amount: 3, target: '$unit' }],
        },
      ],
    },
  ],
  text: 'Deal 3 to all enemy units at a battlefield.',
  flavor: '"Eeny, meeny, miny, burn!" —Annie',
})
