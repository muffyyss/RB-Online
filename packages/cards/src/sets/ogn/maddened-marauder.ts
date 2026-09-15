import { defineCard } from '../../schema.js'

/**
 * OGN-191 — transcribed from the printed card.
 */
export default defineCard({
  id: 'OGN-191',
  set: 'ogn',
  name: 'Maddened Marauder',
  type: 'unit',
  tags: ['Bilgewater', 'Pirate'],
  domains: ['chaos'],
  cost: { energy: 5, power: [] },
  might: 4,
  keywords: ['tank'],
  abilities: [
    {
      kind: 'triggered',
      id: 'maddened-marauder-recall',
      on: 'played',
      steps: [],
      notImplemented: 'the Move action (420) has no step yet',
    },
  ],
  text: '[Tank] (I must be assigned combat damage first.) When you play me, move a unit from a battlefield to its base.',
  flavor: 'They know no fear. Nor much of anything else, really.',
})
