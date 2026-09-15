import { defineCard } from '../../schema.js'

/**
 * OGN-185 — transcribed from the printed card.
 */
export default defineCard({
  id: 'OGN-185',
  set: 'ogn',
  name: 'Traveling Merchant',
  type: 'unit',
  tags: ['Bilgewater'],
  domains: ['chaos'],
  cost: { energy: 2, power: [] },
  might: 2,
  abilities: [
    {
      kind: 'triggered',
      id: 'traveling-merchant-trade',
      on: 'moves',
      steps: [],
      notImplemented: 'discard is not implemented yet',
    },
  ],
  text: 'When I move, discard 1, then draw 1.',
  flavor: 'Payment first, refund never.',
})
