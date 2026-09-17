import { defineCard } from '../../schema.js'

/**
 * OGN-267 - transcribed from the printed card. Bounty Hunter's Legend.
 *
 * A Legend sets the deck's Domain Identity (103.1.b) and is never played: it
 * starts in the Legend Zone and stays there (133.6.b.1, 107.4.d).
 */
export default defineCard({
  id: 'OGN-267',
  set: 'ogn',
  name: 'Bounty Hunter',
  type: 'legend',
  tags: ['Miss Fortune'],
  domains: ['body', 'chaos'],
  abilities: [
    {
      kind: 'activated',
      id: 'bounty-hunter-ganking',
      exhaust: true,
      steps: [
        // "A unit": either player's, as printed.
        { op: 'choose', as: '$unit', from: { kind: 'unit' } },
        { op: 'grant-keyword', keyword: 'ganking', target: '$unit', duration: 'this-turn' },
      ],
    },
  ],
  text: 'Give a unit [Ganking] this turn. (It can move from battlefield to battlefield.)',
})
