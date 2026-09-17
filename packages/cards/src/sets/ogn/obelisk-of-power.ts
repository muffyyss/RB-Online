import { defineCard } from '../../schema.js'

/**
 * OGN-284 - transcribed from the printed card.
 */
export default defineCard({
  id: 'OGN-284',
  set: 'ogn',
  name: 'Obelisk of Power',
  type: 'battlefield',
  domains: [],
  abilities: [
    {
      kind: 'triggered',
      id: 'obelisk-of-power-channel',
      on: 'start-of-turn',
      notImplemented: "a trigger on each player's first Beginning Phase is not modelled",
      steps: [{ op: 'channel', amount: 1 }],
    },
  ],
  text: "At the start of each player's first Beginning Phase, that player channels 1 rune.",
})
