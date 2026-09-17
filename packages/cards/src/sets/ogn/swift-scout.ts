import { defineCard } from '../../schema.js'

/**
 * OGN-263 - transcribed from the printed card. Swift Scout's Legend.
 *
 * A Legend sets the deck's Domain Identity (103.1.b) and is never played: it
 * starts in the Legend Zone and stays there (133.6.b.1, 107.4.d).
 */
export default defineCard({
  id: 'OGN-263',
  set: 'ogn',
  name: 'Swift Scout',
  type: 'legend',
  tags: ['Teemo'],
  domains: ['chaos', 'mind'],
  abilities: [
    {
      kind: 'passive',
      id: 'swift-scout-hide-cost',
      text: 'You may pay [1] to hide a card with [Hidden] instead of [A].',
      notImplemented: 'Hide and the Hidden keyword are not implemented',
    },
    {
      kind: 'activated',
      id: 'swift-scout-recall-teemo',
      cost: { energy: 1, power: [] },
      exhaust: true,
      notImplemented: 'returning a card from the Champion Zone is not an effect step',
      steps: [
        { op: 'choose', as: '$teemo', from: { kind: 'unit', controller: 'self', tag: 'Teemo' } },
        { op: 'return-to-hand', target: '$teemo' },
      ],
    },
  ],
  text: 'You may pay [1] to hide a card with [Hidden] instead of [A]. [1], [E]: Put a Teemo unit you own into your hand from your Champion Zone or the board.',
})
