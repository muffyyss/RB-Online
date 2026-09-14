import { defineCard } from '../../schema.js'

/**
 * OGS-011 — transcribed from the printed card.
 *
 * [Reaction] makes it playable at any time, even with the Chain open (813).
 * The Move game action (420) has no step yet, so the effect is recorded but
 * not run.
 */
export default defineCard({
  id: 'OGS-011',
  set: 'ogs',
  name: 'Flash',
  type: 'spell',
  domains: ['chaos'],
  cost: { energy: 2, power: [] },
  keywords: ['reaction'],
  abilities: [
    {
      kind: 'spell',
      id: 'flash-effect',
      steps: [],
      notImplemented: 'the Move game action (420) has no step yet',
    },
  ],
  text: '[Reaction] (Play any time, even before spells and abilities resolve.) Move up to 2 friendly units to base.',
  flavor: "It's not running away. It's strategic repositioning.",
})
