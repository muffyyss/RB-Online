import { defineCard } from '../../schema.js'

/**
 * OGS-021 — transcribed from the printed card. Lux's starter Legend.
 *
 * Sets a Mind/Order Domain Identity (103.1.b). The draw itself is exact; the
 * cost-5-or-more condition cannot be expressed, and triggers are not
 * dispatched, so the ability does not fire yet.
 */
export default defineCard({
  id: 'OGS-021',
  set: 'ogs',
  name: 'Lady of Luminosity',
  subtitle: 'Starter',
  type: 'legend',
  tags: ['Lux'],
  domains: ['mind', 'order'],
  abilities: [
    {
      kind: 'triggered',
      id: 'lady-of-luminosity-draw',
      on: 'spell-played',
      steps: [{ op: 'draw', amount: 1 }],
      notImplemented: 'needs trigger dispatch and a condition on the spell costing 5 or more',
    },
  ],
  text: 'When you play a spell that costs [5] or more, draw 1.',
})
