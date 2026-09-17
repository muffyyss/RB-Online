import { defineCard } from '../../schema.js'

/**
 * OGN-293 - transcribed from the printed card.
 */
export default defineCard({
  id: 'OGN-293',
  set: 'ogn',
  name: 'The Grand Plaza',
  type: 'battlefield',
  domains: [],
  abilities: [
    {
      kind: 'triggered',
      id: 'the-grand-plaza-win',
      on: 'hold',
      steps: [
        {
          op: 'if',
          condition: {
            kind: 'count',
            of: { kind: 'unit', controller: 'self', at: 'here' },
            atLeast: 7,
          },
          then: [{ op: 'win-game' }],
        },
      ],
    },
  ],
  text: 'When you hold here, if you have 7+ units here, you win the game.',
})
