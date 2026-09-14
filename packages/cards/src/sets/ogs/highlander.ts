import { defineCard } from '../../schema.js'

/**
 * OGS-020 — transcribed from the printed card. Master Yi's Signature spell.
 *
 * "The next time it dies this turn, recall it exhausted instead" is a
 * replacement effect (438) with a duration. Neither is implemented, so the
 * effect is recorded but not run.
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
      steps: [],
      notImplemented: 'replacement effects (438) and "this turn" durations are not implemented',
    },
  ],
  text: "[Reaction] (Play any time, even before spells and abilities resolve.) Choose a friendly unit. The next time it dies this turn, recall it exhausted instead. (Send it to base. This isn't a move.)",
})
