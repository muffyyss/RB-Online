import { defineCard } from '../../schema.js'

/**
 * OGN-277 - transcribed from the printed card.
 */
export default defineCard({
  id: 'OGN-277',
  set: 'ogn',
  name: 'Back-Alley Bar',
  type: 'battlefield',
  domains: [],
  abilities: [
    {
      kind: 'triggered',
      id: 'back-alley-bar-might',
      on: 'moves',
      notImplemented: 'a Battlefield trigger for a unit moving away from it is not modelled',
      steps: [{ op: 'give-might', amount: 1, target: '$me', duration: 'this-turn' }],
    },
  ],
  text: 'When a unit moves from here, give it +1 [Might] this turn.',
})
