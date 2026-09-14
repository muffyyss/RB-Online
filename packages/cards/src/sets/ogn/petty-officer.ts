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
  abilities: [
    {
      kind: 'passive',
      id: 'petty-officer-assault',
      text: '[Assault]',
      notImplemented: 'the Assault keyword (807) is not implemented yet',
    },
  ],
  text: "[Assault] (+1 [Might] while I'm an attacker.)",
  flavor: "Cross him and you'll learn just how petty he can be.",
})
