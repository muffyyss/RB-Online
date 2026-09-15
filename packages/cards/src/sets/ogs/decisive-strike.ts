import { defineCard } from '../../schema.js'

/**
 * OGS-024 — transcribed from the printed card. Garen's Signature spell.
 *
 * One [C]: Power of either of its Domains, Body or Order (135.2.e.6.c). The
 * bonus lasts "this turn", so it is `give-might`, not `buff` (a Buff is a
 * counter that stays).
 */
export default defineCard({
  id: 'OGS-024',
  set: 'ogs',
  name: 'Decisive Strike',
  type: 'spell',
  supertypes: ['signature'],
  tags: ['Garen'],
  domains: ['body', 'order'],
  cost: { energy: 5, power: [{ kind: 'self' }] },
  keywords: ['action'],
  abilities: [
    {
      kind: 'spell',
      id: 'decisive-strike-effect',
      steps: [
        {
          op: 'for-each',
          of: { kind: 'unit', controller: 'self' },
          as: '$ally',
          steps: [{ op: 'give-might', amount: 2, target: '$ally', duration: 'this-turn' }],
        },
      ],
    },
  ],
  text: '[Action] (Play on your turn or in showdowns.) Give friendly units +2 [Might] this turn.',
})
