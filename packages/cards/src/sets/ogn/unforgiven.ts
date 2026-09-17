import { defineCard } from '../../schema.js'

/**
 * OGN-259 - transcribed from the printed card. Unforgiven's Legend.
 *
 * A Legend sets the deck's Domain Identity (103.1.b) and is never played: it
 * starts in the Legend Zone and stays there (133.6.b.1, 107.4.d).
 */
export default defineCard({
  id: 'OGN-259',
  set: 'ogn',
  name: 'Unforgiven',
  type: 'legend',
  tags: ['Yasuo'],
  domains: ['calm', 'chaos'],
  abilities: [
    {
      kind: 'activated',
      id: 'unforgiven-move',
      cost: { energy: 2, power: [] },
      exhaust: true,
      notImplemented: 'an effect Move to a chosen Battlefield is not an effect step',
      steps: [
        { op: 'choose', as: '$ally', from: { kind: 'unit', controller: 'self' } },
        { op: 'move', target: '$ally', to: 'base' },
      ],
    },
  ],
  text: 'Move a friendly unit to or from your base.',
})
