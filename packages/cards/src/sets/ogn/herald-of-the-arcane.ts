import { defineCard } from '../../schema.js'

/**
 * OGN-265 - transcribed from the printed card. Herald of the Arcane's Legend.
 *
 * A Legend sets the deck's Domain Identity (103.1.b) and is never played: it
 * starts in the Legend Zone and stays there (133.6.b.1, 107.4.d).
 */
export default defineCard({
  id: 'OGN-265',
  set: 'ogn',
  name: 'Herald of the Arcane',
  type: 'legend',
  tags: ['Viktor'],
  domains: ['mind', 'order'],
  abilities: [
    {
      kind: 'activated',
      id: 'herald-of-the-arcane-recruit',
      cost: { energy: 1, power: [] },
      exhaust: true,
      // A unit is played to its player's Base unless the card says otherwise (355.2).
      steps: [{ op: 'play-token', token: 'TOK-001', to: 'base' }],
    },
  ],
  text: '[1], [E]: Play a 1 [Might] Recruit unit token.',
})
