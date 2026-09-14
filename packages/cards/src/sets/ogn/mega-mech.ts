import { defineCard } from '../../schema.js'

/**
 * OGN-088 — transcribed from the printed card.
 */
export default defineCard({
  id: 'OGN-088',
  set: 'ogn',
  name: 'Mega-Mech',
  type: 'unit',
  tags: ['Bandle City', 'Mech'],
  domains: ['mind'],
  cost: { energy: 7, power: [] },
  might: 8,
  flavor: "Mech fights have two rules: One—No cheating. Two—Don't get caught cheating.",
})
