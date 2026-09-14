import { defineCard } from '../../schema.js'

/**
 * OGS-008 — transcribed from the printed card.
 *
 * Needs a Might bonus lasting "this turn" (the `buff` step adds permanent
 * counters, which would be wrong) and damage equal to each unit's Might, dealt
 * to each other. Recorded with no steps until both exist.
 */
export default defineCard({
  id: 'OGS-008',
  set: 'ogs',
  name: "Gentlemen's Duel",
  type: 'spell',
  domains: ['body'],
  cost: { energy: 6, power: [{ kind: 'domain', domain: 'body' }] },
  keywords: ['action'],
  abilities: [
    {
      kind: 'spell',
      id: 'gentlemens-duel-effect',
      steps: [],
      notImplemented:
        'needs a Might bonus lasting this turn, and damage equal to Might dealt between two units',
    },
  ],
  text: '[Action] (Play on your turn or in showdowns.) Give a friendly unit +3 [Might] this turn. Then choose an enemy unit. They deal damage equal to their Mights to each other.',
  flavor: 'A proper and formal way to kill your enemies.',
})
