import { defineCard } from '../../schema.js'

/**
 * OGN-126 — transcribed from the printed card.
 *
 * Basic Runes print no rules text: their two abilities come from the rules
 * (164.2). Exhausting adds [1];
 * recycling it to the bottom of the rune deck adds one Power of its Domain.
 */
export default defineCard({
  id: 'OGN-126',
  set: 'ogn',
  name: 'Body Rune',
  type: 'rune',
  domains: ['body'],
  abilities: [
    {
      kind: 'activated',
      id: 'body-rune-energy',
      exhaust: true,
      keywords: ['reaction'],
      steps: [{ op: 'add', energy: 1 }],
    },
    {
      kind: 'activated',
      id: 'body-rune-power',
      recycleSelf: true,
      keywords: ['reaction'],
      steps: [{ op: 'add', power: ['body'] }],
    },
  ],
})
