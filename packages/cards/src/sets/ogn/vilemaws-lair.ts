import { defineCard } from '../../schema.js'

/**
 * OGN-295 - transcribed from the printed card.
 */
export default defineCard({
  id: 'OGN-295',
  set: 'ogn',
  name: "Vilemaw's Lair",
  type: 'battlefield',
  domains: [],
  abilities: [
    {
      kind: 'passive',
      id: 'vilemaws-lair-no-retreat',
      text: "Units can't move from here to base.",
      // Any player's units, and any kind of Move (420.1) - but never a Recall (456.3).
      effect: { kind: 'restrict-move', of: { kind: 'unit', at: 'here' }, to: 'base' },
    },
  ],
  text: "Units can't move from here to base.",
})
