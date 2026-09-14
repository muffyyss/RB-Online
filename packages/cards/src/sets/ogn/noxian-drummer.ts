import { defineCard } from '../../schema.js'

/**
 * OGN-222 — transcribed from the printed card.
 */
export default defineCard({
  id: 'OGN-222',
  set: 'ogn',
  name: 'Noxian Drummer',
  type: 'unit',
  tags: ['Noxus', 'Trifarian'],
  domains: ['order'],
  cost: { energy: 3, power: [] },
  might: 3,
  abilities: [
    {
      kind: 'triggered',
      id: 'noxian-drummer-recruit',
      on: 'moves',
      steps: [],
      notImplemented:
        'triggered abilities are not dispatched by the engine yet, and token creation has no step yet',
    },
  ],
  text: 'When I move to a battlefield, play a 1 [Might] Recruit unit token here. (It is also at the battlefield.)',
  flavor: "Even the Legion's musicians are hard to beat.",
})
