import { defineCard } from '../../schema.js'

/**
 * OGN-089 — transcribed from the printed card.
 *
 * Basic Runes print no rules text: their two abilities come from the rules
 * (164.2). Exhausting for [1] works. Recycling for Power is recorded but marked,
 * because recycling the rune as a cost is not implemented — without that it would
 * be free Power.
 */
export default defineCard({
  id: 'OGN-089',
  set: 'ogn',
  name: 'Mind Rune',
  type: 'rune',
  domains: ['mind'],
  abilities: [
    {
      kind: 'activated',
      id: 'mind-rune-energy',
      exhaust: true,
      keywords: ['reaction'],
      steps: [{ op: 'add', energy: 1 }],
    },
    {
      kind: 'activated',
      id: 'mind-rune-power',
      recycleSelf: true,
      keywords: ['reaction'],
      steps: [{ op: 'add', power: ['mind'] }],
      notImplemented: 'recycling a rune as a cost (164.2.b) is not implemented',
    },
  ],
})
