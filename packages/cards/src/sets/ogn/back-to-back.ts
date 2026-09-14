import { defineCard } from '../../schema.js'

/**
 * OGN-206 — transcribed from the printed card.
 */
export default defineCard({
  id: 'OGN-206',
  set: 'ogn',
  name: 'Back to Back',
  type: 'spell',
  domains: ['order'],
  cost: { energy: 3, power: [] },
  keywords: ['reaction'],
  abilities: [
    {
      kind: 'spell',
      id: 'back-to-back-effect',
      steps: [],
      notImplemented: 'needs a Might bonus lasting this turn',
    },
  ],
  text: '[Reaction] (Play any time, even before spells and abilities resolve.) Give two friendly units each +2 [Might] this turn.',
  flavor: 'Fight together or die alone.',
})
