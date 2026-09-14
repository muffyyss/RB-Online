import { defineCard } from '../../schema.js'

/**
 * OGN-084 — transcribed from the printed card.
 */
export default defineCard({
  id: 'OGN-084',
  set: 'ogn',
  name: 'Eager Apprentice',
  type: 'unit',
  tags: ['Piltover'],
  domains: ['mind'],
  cost: { energy: 3, power: [] },
  might: 3,
  abilities: [
    {
      kind: 'passive',
      id: 'eager-apprentice-discount',
      text: "While I'm at a battlefield, spells you play cost 1 less Energy, to a minimum of 1.",
      notImplemented: 'cost modification (356) is not implemented',
    },
  ],
  text: "While I'm at a battlefield, the Energy costs for spells you play is reduced by [1], to a minimum of [1].",
  flavor: '"As long as these thirty-seven things go right, it\'ll work every time!"',
})
