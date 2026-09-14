import { defineCard } from '../../schema.js'

/**
 * OGN-095 — transcribed from the printed card.
 */
export default defineCard({
  id: 'OGN-095',
  set: 'ogn',
  name: 'Stupefy',
  type: 'spell',
  domains: ['mind'],
  cost: { energy: 1, power: [] },
  keywords: ['reaction'],
  abilities: [
    {
      kind: 'spell',
      id: 'stupefy-effect',
      steps: [],
      notImplemented: 'needs a Might modifier lasting this turn, with a minimum',
    },
  ],
  text: '[Reaction] (Play any time, even before spells and abilities resolve.) Give a unit -1 [Might] this turn, to a minimum of 1 [Might]. Draw 1.',
  flavor: "It's easier to outsmart an opponent with a concussion.",
})
