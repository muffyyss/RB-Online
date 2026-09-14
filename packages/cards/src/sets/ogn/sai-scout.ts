import { defineCard } from '../../schema.js'

/**
 * OGN-174 — transcribed from the printed card.
 */
export default defineCard({
  id: 'OGN-174',
  set: 'ogn',
  name: 'Sai Scout',
  type: 'unit',
  tags: ['Shurima'],
  domains: ['chaos'],
  cost: { energy: 6, power: [] },
  might: 5,
  abilities: [
    {
      kind: 'passive',
      id: 'sai-scout-vision',
      text: '[Vision]',
      notImplemented: 'the Vision keyword (817) is not implemented yet',
    },
    {
      kind: 'passive',
      id: 'sai-scout-open-battlefield',
      text: 'You may play me to an open battlefield.',
      notImplemented: 'playing a unit anywhere but base is not implemented',
    },
  ],
  text: '[Vision] (When you play me, look at the top card of your Main Deck. You may recycle it.) You may play me to an open battlefield.',
  flavor: '"Ours for the taking!"',
})
