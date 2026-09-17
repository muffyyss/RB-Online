import { defineCard } from '../../schema.js'

/**
 * OGN-253 - transcribed from the printed card. Hand of Noxus's Legend.
 *
 * A Legend sets the deck's Domain Identity (103.1.b) and is never played: it
 * starts in the Legend Zone and stays there (133.6.b.1, 107.4.d).
 */
export default defineCard({
  id: 'OGN-253',
  set: 'ogn',
  name: 'Hand of Noxus',
  type: 'legend',
  tags: ['Darius'],
  domains: ['fury', 'order'],
  abilities: [
    {
      kind: 'activated',
      id: 'hand-of-noxus-energy',
      exhaust: true,
      keywords: ['reaction', 'legion'],
      notImplemented: 'Legion (812) is not implemented',
      steps: [{ op: 'add', energy: 1 }],
    },
  ],
  text: "[E]: [Reaction], [Legion] — Add [1]. (Abilities that add resources can't be reacted to. Get the effect if you've played a card this turn.)",
})
