import { defineCard } from '../../schema.js'

/**
 * OGN-052 — transcribed from the printed card.
 */
export default defineCard({
  id: 'OGN-052',
  set: 'ogn',
  name: 'Stalwart Poro',
  type: 'unit',
  tags: ['Poro'],
  domains: ['calm'],
  cost: { energy: 2, power: [] },
  might: 2,
  keywords: ['shield'],
  text: "[Shield] (+1 [Might] while I'm a defender.)",
  flavor: 'It suits him.',
})
