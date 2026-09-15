import { defineCard } from '../../schema.js'

/**
 * OGN-103 — transcribed from the printed card.
 */
export default defineCard({
  id: 'OGN-103',
  set: 'ogn',
  name: 'Ravenbloom Student',
  type: 'unit',
  tags: ['Noxus'],
  domains: ['mind'],
  cost: { energy: 2, power: [] },
  might: 2,
  abilities: [
    {
      kind: 'triggered',
      id: 'ravenbloom-student-empowered',
      on: 'spell-played',
      steps: [{ op: 'give-might', amount: 1, target: '$me', duration: 'this-turn' }],
    },
  ],
  text: 'When you play a spell, give me +1 [Might] this turn.',
  flavor: 'A little knowledge is a dangerous thing. A lot of knowledge is awesome.',
})
