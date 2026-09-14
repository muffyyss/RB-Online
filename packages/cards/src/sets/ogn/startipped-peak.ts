import { defineCard } from '../../schema.js'

/**
 * OGN-288 — transcribed from the printed card.
 */
export default defineCard({
  id: 'OGN-288',
  set: 'ogn',
  name: 'Startipped Peak',
  type: 'battlefield',
  domains: [],
  abilities: [
    {
      kind: 'triggered',
      id: 'startipped-peak-channel',
      on: 'hold',
      steps: [],
      notImplemented: 'needs trigger dispatch and channelling a rune exhausted',
    },
  ],
  text: 'When you hold here, you may channel 1 rune exhausted.',
})
