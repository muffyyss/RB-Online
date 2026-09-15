import { defineCard } from '../../schema.js'

/**
 * OGN-210 — transcribed from the printed card.
 */
export default defineCard({
  id: 'OGN-210',
  set: 'ogn',
  name: 'Daring Poro',
  type: 'unit',
  tags: ['Poro'],
  domains: ['order'],
  cost: { energy: 2, power: [] },
  might: 2,
  keywords: ['assault'],
  text: "[Assault] (+1 [Might] while I'm an attacker.)",
  flavor: "Don't worry, they love it.",
})
