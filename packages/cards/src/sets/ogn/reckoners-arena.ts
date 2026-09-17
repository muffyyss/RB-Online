import { defineCard } from '../../schema.js'

/**
 * OGN-286 - transcribed from the printed card.
 */
export default defineCard({
  id: 'OGN-286',
  set: 'ogn',
  name: "Reckoner's Arena",
  type: 'battlefield',
  domains: [],
  abilities: [
    {
      kind: 'triggered',
      id: 'reckoners-arena-conquer-effects',
      on: 'hold',
      notImplemented: "activating another card's Conquer abilities is not an effect step",
      steps: [{ op: 'draw', amount: 0 }],
    },
  ],
  text: 'When you hold here, activate the conquer effects of units here.',
})
