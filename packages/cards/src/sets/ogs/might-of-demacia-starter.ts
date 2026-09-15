import { defineCard } from '../../schema.js'

/**
 * OGS-023 — transcribed from the printed card. Garen's starter Legend.
 *
 * Sets a Body/Order Domain Identity (103.1.b). The 4+ units are counted at the
 * Battlefield just conquered, after the Conquer.
 */
export default defineCard({
  id: 'OGS-023',
  set: 'ogs',
  name: 'Might of Demacia',
  subtitle: 'Starter',
  type: 'legend',
  tags: ['Garen'],
  domains: ['body', 'order'],
  abilities: [
    {
      kind: 'triggered',
      id: 'might-of-demacia-draw',
      on: 'conquer',
      condition: { kind: 'units-at-battlefield-at-least', count: 4 },
      steps: [{ op: 'draw', amount: 2 }],
    },
  ],
  text: 'When you conquer, if you have 4+ units at that battlefield, draw 2.',
})
