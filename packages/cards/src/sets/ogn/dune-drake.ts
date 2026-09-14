import { defineCard } from '../../schema.js'

/**
 * OGN-131 — transcribed from the printed card.
 */
export default defineCard({
  id: 'OGN-131',
  set: 'ogn',
  name: 'Dune Drake',
  type: 'unit',
  tags: ['Shurima', 'Dragon'],
  domains: ['body'],
  cost: { energy: 5, power: [] },
  might: 5,
  abilities: [
    {
      kind: 'triggered',
      id: 'dune-drake-hunt',
      on: 'attack',
      steps: [],
      notImplemented:
        'triggered abilities are not dispatched by the engine yet, and the ready-enemy condition cannot be expressed',
    },
  ],
  text: 'When I attack, give me +2 [Might] if there is a ready enemy unit here.',
  flavor: 'Dragons hunt not just for food, but for the thrill of it.',
})
