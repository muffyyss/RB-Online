import { defineCard } from '../../schema.js'

/**
 * OGS-023 — transcribed from the printed card. Garen's starter Legend.
 *
 * Sets a Body/Order Domain Identity (103.1.b). The draw is exact; the "4+ units
 * at that battlefield" condition cannot be expressed, and triggers are not
 * dispatched, so the ability does not fire yet.
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
      steps: [{ op: 'draw', amount: 2 }],
      notImplemented:
        'needs trigger dispatch and a condition on having 4+ units at the battlefield',
    },
  ],
  text: 'When you conquer, if you have 4+ units at that battlefield, draw 2.',
})
