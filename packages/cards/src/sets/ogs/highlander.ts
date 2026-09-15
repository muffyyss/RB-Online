import { defineCard } from '../../schema.js'

/**
 * OGS-020 — transcribed from the printed card. Master Yi's Signature spell.
 *
 * "The next time it dies this turn, recall it exhausted instead" is a
 * replacement effect (438). A Recall leaves damage in place (458.1): in combat
 * the Combat Cleanup heals it (466.1.a.1), but a unit saved from lethal damage
 * outside combat still has it at the next Cleanup, and dies then.
 */
export default defineCard({
  id: 'OGS-020',
  set: 'ogs',
  name: 'Highlander',
  type: 'spell',
  supertypes: ['signature'],
  tags: ['Master Yi'],
  domains: ['body', 'calm'],
  cost: { energy: 4, power: [] },
  keywords: ['reaction'],
  abilities: [
    {
      kind: 'spell',
      id: 'highlander-effect',
      steps: [
        { op: 'choose', as: '$unit', from: { kind: 'unit', controller: 'self' } },
        { op: 'recall-instead-of-dying', target: '$unit', duration: 'this-turn' },
      ],
    },
  ],
  text: "[Reaction] (Play any time, even before spells and abilities resolve.) Choose a friendly unit. The next time it dies this turn, recall it exhausted instead. (Send it to base. This isn't a move.)",
})
