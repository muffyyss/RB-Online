import { defineCard } from '../../schema.js'

/**
 * OGS-008 — transcribed from the printed card.
 *
 * Both units are targets, chosen as it is played (355.5). Their Mights are read
 * as the duel happens, with the +3 already given, and they deal damage to each
 * other at once.
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
      steps: [
        { op: 'choose', as: '$ally', from: { kind: 'unit', controller: 'self' } },
        { op: 'give-might', amount: 3, target: '$ally', duration: 'this-turn' },
        { op: 'choose', as: '$enemy', from: { kind: 'unit', controller: 'opponent' } },
        { op: 'deal-each-other', a: '$ally', b: '$enemy' },
      ],
    },
  ],
  text: '[Action] (Play on your turn or in showdowns.) Give a friendly unit +3 [Might] this turn. Then choose an enemy unit. They deal damage equal to their Mights to each other.',
  flavor: 'A proper and formal way to kill your enemies.',
})
