import { defineCard } from '../../schema.js'

/**
 * OGN-278 - transcribed from the printed card.
 */
export default defineCard({
  id: 'OGN-278',
  set: 'ogn',
  name: 'Bandle Tree',
  type: 'battlefield',
  domains: [],
  abilities: [
    {
      kind: 'passive',
      id: 'bandle-tree-facedown',
      text: 'You may hide an additional card here.',
      // 107.3.b.1 - the Facedown Zone's occupancy, which Hide fills.
      notImplemented: 'Hide and the Facedown Zone are not implemented',
    },
  ],
  text: 'You may hide an additional card here.',
})
