import { defineCard } from '../../schema.js'

/**
 * OGS-008 — transcribed from the printed card.
 *
 * The +3 is expressible (`give-might`), but the duel is not: two units dealing
 * damage equal to their Mights to each other. Recorded with no steps until that
 * exists, rather than as a spell that only does its first half.
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
      notImplemented: 'damage equal to Might, dealt between two units, has no step yet',
    },
  ],
  text: '[Action] (Play on your turn or in showdowns.) Give a friendly unit +3 [Might] this turn. Then choose an enemy unit. They deal damage equal to their Mights to each other.',
  flavor: 'A proper and formal way to kill your enemies.',
})
