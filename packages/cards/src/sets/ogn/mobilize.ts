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
      steps: [],
      notImplemented: 'channelling a rune exhausted, and the fallback draw, are not implemented',
    },
  ],
  text: "Channel 1 rune exhausted. If you can't, draw 1.",
  flavor: 'The sound of the trumpets is the first blow struck in battle.',
})
