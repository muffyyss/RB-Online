import { defineCard } from '../../schema.js'

/**
 * OGN-219 — transcribed from the printed card.
 */
export default defineCard({
  id: 'OGN-219',
  set: 'ogn',
  name: 'Vanguard Sergeant',
  type: 'unit',
  tags: ['Demacia', 'Elite'],
  domains: ['order'],
  cost: { energy: 4, power: [] },
  might: 4,
  flavor: 'He knew his orders: hold the line, or there would be nothing left to hold.',
})
