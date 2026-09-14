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
  abilities: [
    {
      kind: 'passive',
      id: 'daring-poro-assault',
      text: '[Assault]',
      notImplemented: 'the Assault keyword (807) is not implemented yet',
    },
  ],
  text: "[Assault] (+1 [Might] while I'm an attacker.)",
  flavor: "Don't worry, they love it.",
})
