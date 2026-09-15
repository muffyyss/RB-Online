import { defineCard } from '../../schema.js'

/**
 * OGS-018 — transcribed from the printed card. Annie's Signature unit.
 *
 * The cost is two [C]: Power of the card's own Domains, so either Fury or Chaos
 * pays each one (135.2.e.6.c — the rulebook uses Tibbers as its example).
 *
 * "All units at battlefields" means both players' units, at every Battlefield.
 * It is a Play Effect (383.4.a): it triggers once Tibbers is on the board, so
 * Tibbers is in base and safe from its own blast.
 */
export default defineCard({
  id: 'OGS-018',
  set: 'ogs',
  name: 'Tibbers',
  type: 'unit',
  supertypes: ['signature'],
  tags: ['Annie'],
  domains: ['chaos', 'fury'],
  cost: { energy: 8, power: [{ kind: 'self' }, { kind: 'self' }] },
  might: 7,
  abilities: [
    {
      kind: 'triggered',
      id: 'tibbers-bear-hug',
      on: 'played',
      steps: [
        {
          op: 'for-each',
          of: { kind: 'unit', at: 'any-battlefield' },
          as: '$unit',
          steps: [{ op: 'deal', amount: 3, target: '$unit' }],
        },
      ],
    },
  ],
  text: 'When you play me, deal 3 to all units at battlefields.',
  flavor: '"Bear hug!" —Annie',
})
