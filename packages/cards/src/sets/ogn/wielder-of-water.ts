import { defineCard } from '../../schema.js'

/**
 * OGN-055 — transcribed from the printed card.
 */
export default defineCard({
  id: 'OGN-055',
  set: 'ogn',
  name: 'Wielder of Water',
  type: 'unit',
  tags: ['Ionia'],
  domains: ['calm'],
  cost: { energy: 3, power: [] },
  might: 2,
  abilities: [
    {
      kind: 'passive',
      id: 'wielder-of-water-alone',
      text: "While I'm attacking or defending alone, I have +2 Might.",
      notImplemented: 'conditional Might needs the continuous-effect layer',
    },
  ],
  text: "While I'm attacking or defending alone, I have +2 [Might].",
  flavor: 'Each drop an ocean of possibilities.',
})
