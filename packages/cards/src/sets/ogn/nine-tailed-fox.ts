import { defineCard } from '../../schema.js'

/**
 * OGN-255 - transcribed from the printed card. Nine-Tailed Fox's Legend.
 *
 * A Legend sets the deck's Domain Identity (103.1.b) and is never played: it
 * starts in the Legend Zone and stays there (133.6.b.1, 107.4.d).
 */
export default defineCard({
  id: 'OGN-255',
  set: 'ogn',
  name: 'Nine-Tailed Fox',
  type: 'legend',
  tags: ['Ahri'],
  domains: ['calm', 'mind'],
  abilities: [
    {
      kind: 'triggered',
      id: 'nine-tailed-fox-weaken',
      on: 'attack',
      notImplemented:
        'a Legend trigger on an enemy attacking a Battlefield you control is not modelled',
      steps: [{ op: 'give-might', amount: -1, target: '$me', duration: 'this-turn', minimum: 1 }],
    },
  ],
  text: 'When an enemy unit attacks a battlefield you control, give it -1 [Might] this turn, to a minimum of 1 [Might].',
})
