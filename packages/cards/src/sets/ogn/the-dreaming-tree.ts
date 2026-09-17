import { defineCard } from '../../schema.js'

/**
 * OGN-292 - transcribed from the printed card.
 */
export default defineCard({
  id: 'OGN-292',
  set: 'ogn',
  name: 'The Dreaming Tree',
  type: 'battlefield',
  domains: [],
  abilities: [
    {
      kind: 'triggered',
      id: 'the-dreaming-tree-draw',
      on: 'spell-played',
      notImplemented: 'a trigger on choosing a unit with a spell, once a turn, is not modelled',
      steps: [{ op: 'draw', amount: 1 }],
    },
  ],
  text: 'The first time you choose a friendly unit with a spell here each turn, draw 1.',
})
