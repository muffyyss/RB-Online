import { defineCard } from '../../schema.js'

/**
 * OGN-166 — transcribed from the printed card.
 *
 * Basic Runes print no rules text: their two abilities come from the rules
 * (164.2). Exhausting adds [1];
 * recycling it to the bottom of the rune deck adds one Power of its Domain.
 */
export default defineCard({
  id: 'OGN-166',
  set: 'ogn',
  name: 'Chaos Rune',
  type: 'rune',
  domains: ['chaos'],
  abilities: [
    {
      kind: 'activated',
      id: 'chaos-rune-energy',
      exhaust: true,
      keywords: ['reaction'],
      steps: [{ op: 'add', energy: 1 }],
    },
    {
      kind: 'activated',
      id: 'chaos-rune-power',
      recycleSelf: true,
      keywords: ['reaction'],
      steps: [{ op: 'add', power: ['chaos'] }],
    },
  ],
})
