import { defineCard } from '../../schema.js'

/**
 * OGN-134 — transcribed from the printed card.
 */
export default defineCard({
  id: 'OGN-134',
  set: 'ogn',
  name: 'Mobilize',
  type: 'spell',
  domains: ['body'],
  cost: { energy: 2, power: [] },
  abilities: [
    {
      kind: 'spell',
      id: 'mobilize-effect',
      steps: [
        {
          op: 'if',
          // "If you can't": nothing left in the Rune Deck to channel (430.3).
          condition: {
            kind: 'count',
            of: { kind: 'rune', controller: 'self', zone: 'runeDeck' },
            atLeast: 1,
          },
          then: [{ op: 'channel', amount: 1, exhausted: true }],
          else: [{ op: 'draw', amount: 1 }],
        },
      ],
    },
  ],
  text: "Channel 1 rune exhausted. If you can't, draw 1.",
  flavor: 'The sound of the trumpets is the first blow struck in battle.',
})
