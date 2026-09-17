import { defineCard } from '../../schema.js'

/**
 * OGN-290 - transcribed from the printed card.
 */
export default defineCard({
  id: 'OGN-290',
  set: 'ogn',
  name: "The Arena's Greatest",
  type: 'battlefield',
  domains: [],
  abilities: [
    {
      kind: 'triggered',
      id: 'the-arenas-greatest-point',
      on: 'start-of-turn',
      notImplemented: "gaining a point on each player's first Beginning Phase is not modelled",
      steps: [{ op: 'draw', amount: 0 }],
    },
  ],
  text: "At the start of each player's first Beginning Phase, that player gains 1 point.",
})
