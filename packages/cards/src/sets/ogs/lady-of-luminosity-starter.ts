import { defineCard } from '../../schema.js'

/**
 * OGS-021 — transcribed from the printed card. Lux's starter Legend.
 *
 * Sets a Mind/Order Domain Identity (103.1.b). The cost is the spell's printed
 * Energy; the condition belongs to the trigger (383.2.a.1), so a cheaper spell
 * does not put anything on the Chain at all.
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
      condition: { kind: 'spell-cost-at-least', energy: 5 },
      steps: [{ op: 'draw', amount: 1 }],
    },
  ],
  text: 'When you play a spell that costs [5] or more, draw 1.',
})
