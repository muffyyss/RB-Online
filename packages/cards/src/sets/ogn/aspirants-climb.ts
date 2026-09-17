import { defineCard } from '../../schema.js'

/**
 * OGN-276 - transcribed from the printed card.
 */
export default defineCard({
  id: 'OGN-276',
  set: 'ogn',
  name: "Aspirant's Climb",
  type: 'battlefield',
  domains: [],
  abilities: [
    {
      kind: 'passive',
      id: 'aspirants-climb-victory-score',
      text: 'Increase the points needed to win the game by 1.',
      // The Victory Score itself, for both players (466.2).
      effect: { kind: 'points-to-win', amount: 1 },
    },
  ],
  text: 'Increase the points needed to win the game by 1.',
})
