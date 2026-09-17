import { defineCard } from '../../schema.js'

/**
 * OGN-249 - transcribed from the printed card. Relentless Storm's Legend.
 *
 * A Legend sets the deck's Domain Identity (103.1.b) and is never played: it
 * starts in the Legend Zone and stays there (133.6.b.1, 107.4.d).
 */
export default defineCard({
  id: 'OGN-249',
  set: 'ogn',
  name: 'Relentless Storm',
  type: 'legend',
  tags: ['Volibear'],
  domains: ['body', 'fury'],
  abilities: [
    {
      kind: 'triggered',
      id: 'relentless-storm-channel',
      on: 'played',
      notImplemented: 'a trigger on playing another unit, and Mighty, are not modelled',
      steps: [{ op: 'channel', amount: 1, exhausted: true }],
    },
  ],
  text: 'When you play a [Mighty] unit, you may exhaust me to channel 1 rune exhausted. (A unit is Mighty while it has 5+ [Might].)',
})
