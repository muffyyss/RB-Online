import { defineCard } from '../../schema.js'

/**
 * OGN-251 - transcribed from the printed card. Loose Cannon's Legend.
 *
 * A Legend sets the deck's Domain Identity (103.1.b) and is never played: it
 * starts in the Legend Zone and stays there (133.6.b.1, 107.4.d).
 */
export default defineCard({
  id: 'OGN-251',
  set: 'ogn',
  name: 'Loose Cannon',
  type: 'legend',
  tags: ['Jinx'],
  domains: ['chaos', 'fury'],
  abilities: [
    {
      kind: 'triggered',
      id: 'loose-cannon-draw',
      on: 'start-of-turn',
      steps: [
        {
          op: 'if',
          // Your hand, counted as the Beginning Phase starts (413).
          condition: {
            kind: 'count',
            of: { kind: 'card', controller: 'self', zone: 'hand' },
            atMost: 1,
          },
          then: [{ op: 'draw', amount: 1 }],
        },
      ],
    },
  ],
  text: 'At start of your Beginning Phase, draw 1 if you have one or fewer cards in your hand.',
})
