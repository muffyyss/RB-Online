import { defineCard } from '../../schema.js'

/**
 * OGN-042 — transcribed from the printed card.
 *
 * Basic Runes print no rules text: their two abilities come from the rules
 * (164.2). Exhausting adds [1];
 * recycling it to the bottom of the rune deck adds one Power of its Domain.
 */
export default defineCard({
  id: 'OGN-042',
  set: 'ogn',
  name: 'Calm Rune',
  type: 'rune',
  domains: ['calm'],
  abilities: [
    {
      kind: 'activated',
      id: 'calm-rune-energy',
      exhaust: true,
      keywords: ['reaction'],
      steps: [{ op: 'add', energy: 1 }],
    },
    {
      kind: 'activated',
      id: 'calm-rune-power',
      recycleSelf: true,
      keywords: ['reaction'],
      steps: [{ op: 'add', power: ['calm'] }],
    },
  ],
})
