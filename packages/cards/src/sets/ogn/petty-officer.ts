import { defineCard } from '../../schema.js'

/**
 * OGN-215 — transcribed from the printed card.
 */
export default defineCard({
  id: 'OGN-215',
  set: 'ogn',
  name: 'Petty Officer',
  type: 'unit',
  tags: ['Bilgewater', 'Pirate'],
  domains: ['order'],
  cost: { energy: 5, power: [] },
  might: 5,
  keywords: ['assault'],
  text: "[Assault] (+1 [Might] while I'm an attacker.)",
  flavor: "Cross him and you'll learn just how petty he can be.",
})
