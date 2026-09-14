import { defineCard } from '../../schema.js'

/**
 * OGN-048 — transcribed from the printed card.
 */
export default defineCard({
  id: 'OGN-048',
  set: 'ogn',
  name: 'Meditation',
  type: 'spell',
  domains: ['calm'],
  cost: { energy: 2, power: [] },
  keywords: ['reaction'],
  abilities: [
    {
      kind: 'spell',
      id: 'meditation-effect',
      steps: [],
      notImplemented: 'optional additional costs are not implemented',
    },
  ],
  text: '[Reaction] (Play any time, even before spells and abilities resolve.) As an additional cost to play this, you may exhaust a friendly unit. If you do, draw 2. Otherwise, draw 1.',
})
