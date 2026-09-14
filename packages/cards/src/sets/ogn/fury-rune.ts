import { defineCard } from '../../schema.js'

/**
 * OGN-007 — transcribed from the printed card.
 *
 * Basic Runes print no rules text: their two abilities come from the rules
 * (164.2). Exhausting for [1] works. Recycling for Power is recorded but marked,
 * because recycling the rune as a cost is not implemented — without that it would
 * be free Power.
 */
export default defineCard({
  id: 'OGN-007',
  set: 'ogn',
  name: 'Fury Rune',
  type: 'rune',
  domains: ['fury'],
  abilities: [
    {
      kind: 'activated',
      id: 'fury-rune-energy',
      exhaust: true,
      keywords: ['reaction'],
      steps: [{ op: 'add', energy: 1 }],
    },
    {
      kind: 'activated',
      id: 'fury-rune-power',
      recycleSelf: true,
      keywords: ['reaction'],
      steps: [{ op: 'add', power: ['fury'] }],
      notImplemented: 'recycling a rune as a cost (164.2.b) is not implemented',
    },
  ],
})
