import { defineCard } from '../../schema.js'

/**
 * OGN-279 — transcribed from the printed card.
 */
export default defineCard({
  id: 'OGN-279',
  set: 'ogn',
  name: 'Fortified Position',
  type: 'battlefield',
  domains: [],
  abilities: [
    {
      kind: 'triggered',
      id: 'fortified-position-shield',
      on: 'defend',
      steps: [
        // "A unit": any unit, as printed.
        { op: 'choose', as: '$unit', from: { kind: 'unit' } },
        {
          op: 'grant-keyword',
          keyword: 'shield',
          value: 2,
          target: '$unit',
          duration: 'this-combat',
        },
      ],
    },
  ],
  text: "When you defend here, choose a unit. It gains [Shield 2] this combat. (+2 [Might] while it's a defender.)",
})
