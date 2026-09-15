import { defineCard } from '../../schema.js'

/**
 * OGN-131 — transcribed from the printed card.
 *
 * The +2 has no printed duration (checked against the card image). Like a
 * keyword given with no duration (801.3.a.3), it lasts while the Drake stays
 * on the board.
 */
export default defineCard({
  id: 'OGN-131',
  set: 'ogn',
  name: 'Dune Drake',
  type: 'unit',
  tags: ['Shurima', 'Dragon'],
  domains: ['body'],
  cost: { energy: 5, power: [] },
  might: 5,
  abilities: [
    {
      kind: 'triggered',
      id: 'dune-drake-hunt',
      on: 'attack',
      steps: [
        {
          op: 'if',
          condition: {
            kind: 'count',
            of: { kind: 'unit', controller: 'opponent', at: 'here', exhausted: false },
            atLeast: 1,
          },
          then: [{ op: 'give-might', amount: 2, target: '$me', duration: 'while-on-board' }],
        },
      ],
    },
  ],
  text: 'When I attack, give me +2 [Might] if there is a ready enemy unit here.',
  flavor: 'Dragons hunt not just for food, but for the thrill of it.',
})
