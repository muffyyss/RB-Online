import { defineCard } from '../../schema.js'

/**
 * OGN-257 - transcribed from the printed card. Blind Monk's Legend.
 *
 * A Legend sets the deck's Domain Identity (103.1.b) and is never played: it
 * starts in the Legend Zone and stays there (133.6.b.1, 107.4.d).
 */
export default defineCard({
  id: 'OGN-257',
  set: 'ogn',
  name: 'Blind Monk',
  type: 'legend',
  tags: ['Lee Sin'],
  domains: ['body', 'calm'],
  abilities: [
    {
      kind: 'activated',
      id: 'blind-monk-buff',
      cost: { energy: 1, power: [] },
      exhaust: true,
      steps: [
        { op: 'choose', as: '$ally', from: { kind: 'unit', controller: 'self' } },
        { op: 'buff', amount: 1, target: '$ally' },
      ],
    },
  ],
  text: "[1], [E]: Buff a friendly unit. (If it doesn't have a buff, it gets a +1 [Might] buff.)",
})
