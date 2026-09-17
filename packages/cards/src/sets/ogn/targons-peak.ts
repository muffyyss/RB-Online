import { defineCard } from '../../schema.js'

/**
 * OGN-289 - transcribed from the printed card.
 */
export default defineCard({
  id: 'OGN-289',
  set: 'ogn',
  name: "Targon's Peak",
  type: 'battlefield',
  domains: [],
  abilities: [
    {
      kind: 'triggered',
      id: 'targons-peak-ready-runes',
      on: 'conquer',
      notImplemented: 'a delayed effect at the end of the turn (389) is not modelled',
      steps: [{ op: 'ready', target: { kind: 'rune', controller: 'self', count: 2 } }],
    },
  ],
  text: 'When you conquer here, ready 2 runes at the end of this turn.',
})
