import { defineCard } from '../../schema.js'

/**
 * OGN-046 — transcribed from the printed card.
 */
export default defineCard({
  id: 'OGN-046',
  set: 'ogn',
  name: 'En Garde',
  type: 'spell',
  domains: ['calm'],
  cost: { energy: 1, power: [] },
  keywords: ['reaction'],
  abilities: [
    {
      kind: 'spell',
      id: 'en-garde-effect',
      steps: [],
      notImplemented:
        'needs a Might bonus lasting this turn, and a condition on being the only unit there',
    },
  ],
  text: '[Reaction] (Play any time, even before spells and abilities resolve.) Give a friendly unit +1 [Might] this turn, then an additional +1 [Might] this turn if it is the only unit you control there.',
  flavor: '"Is this supposed to be a challenge?" —Fiora',
})
