import { defineCard } from '../../schema.js'

/**
 * OGN-247 - transcribed from the printed card. Daughter of the Void's Legend.
 *
 * A Legend sets the deck's Domain Identity (103.1.b) and is never played: it
 * starts in the Legend Zone and stays there (133.6.b.1, 107.4.d).
 */
export default defineCard({
  id: 'OGN-247',
  set: 'ogn',
  name: 'Daughter of the Void',
  type: 'legend',
  tags: ['Kai’Sa'],
  domains: ['fury', 'mind'],
  abilities: [
    {
      kind: 'activated',
      id: 'daughter-of-the-void-power',
      exhaust: true,
      keywords: ['reaction'],
      // [A] Power that may only pay for spells (429, 356).
      steps: [{ op: 'add', universal: 1, onlyFor: ['spell'] }],
    },
  ],
  text: "[E]: [Reaction] — Add [A]. Use only to play spells. (Abilities that add resources can't be reacted to.)",
})
