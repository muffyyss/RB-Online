import { defineCard } from '../../schema.js'

/**
 * OGN-211 — transcribed from the printed card.
 */
export default defineCard({
  id: 'OGN-211',
  set: 'ogn',
  name: 'Faithful Manufactor',
  type: 'unit',
  tags: ['Piltover'],
  domains: ['order'],
  cost: { energy: 3, power: [] },
  might: 2,
  abilities: [
    {
      kind: 'triggered',
      id: 'faithful-manufactor-recruit',
      on: 'played',
      steps: [{ op: 'play-token', token: 'TOK-001', to: 'here' }],
    },
  ],
  text: 'When you play me, play a 1 [Might] Recruit unit token here.',
  flavor: 'Hard work is its own reward.',
})
