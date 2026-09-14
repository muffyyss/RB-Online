import { defineCard } from '../../schema.js'

/**
 * OGN-142 — transcribed from the printed card.
 */
export default defineCard({
  id: 'OGN-142',
  set: 'ogn',
  name: 'Mountain Drake',
  type: 'unit',
  tags: ['Dragon'],
  domains: ['body'],
  cost: { energy: 9, power: [] },
  might: 10,
  flavor:
    "After centuries spent trying to understand dragon behavior, researchers can agree on one thing: If you're seeing that behavior up close ... run.",
})
