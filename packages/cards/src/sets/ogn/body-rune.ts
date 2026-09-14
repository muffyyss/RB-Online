import { defineCard } from '../../schema.js'

/**
 * OGN-126 — transcribed from the printed card.
 *
 * Basic Runes print no rules text: their two abilities come from the rules
 * (164.2). Exhausting for [1] works. Recycling for Power is recorded but marked,
 * because recycling the rune as a cost is not implemented — without that it would
 * be free Power.
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
      notImplemented: 'recycling a rune as a cost (164.2.b) is not implemented',
    },
  ],
})
