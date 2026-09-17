import { defineCard } from '../../schema.js'

/**
 * OGN-283 - transcribed from the printed card.
 */
export default defineCard({
  id: 'OGN-283',
  set: 'ogn',
  name: 'Navori Fighting Pit',
  type: 'battlefield',
  domains: [],
  abilities: [
    {
      kind: 'triggered',
      id: 'navori-fighting-pit-buff',
      on: 'hold',
      steps: [
        // "A unit here": either player's, as printed.
        { op: 'choose', as: '$unit', from: { kind: 'unit', at: 'here' } },
        { op: 'buff', amount: 1, target: '$unit' },
      ],
    },
  ],
  text: "When you hold here, buff a unit here. (If it doesn't have a buff, it gets a +1 [Might] buff.)",
})
