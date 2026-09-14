import { defineCard } from '../../schema.js'

/**
 * OGN-130 — transcribed from the printed card.
 */
export default defineCard({
  id: 'OGN-130',
  set: 'ogn',
  name: 'Crackshot Corsair',
  type: 'unit',
  tags: ['Bilgewater', 'Pirate'],
  domains: ['body'],
  cost: { energy: 3, power: [] },
  might: 3,
  abilities: [
    {
      kind: 'triggered',
      id: 'crackshot-corsair-shot',
      on: 'attack',
      steps: [],
      notImplemented: 'triggered abilities are not dispatched by the engine yet',
    },
  ],
  text: 'When I attack, deal 1 to an enemy unit here.',
  flavor: '"Ahoy."',
})
