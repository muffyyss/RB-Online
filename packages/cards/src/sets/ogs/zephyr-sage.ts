import { defineCard } from '../../schema.js'

/**
 * OGS-005 — transcribed from the printed card.
 */
export default defineCard({
  id: 'OGS-005',
  set: 'ogs',
  name: 'Zephyr Sage',
  type: 'unit',
  tags: ['Ionia', 'Bird'],
  domains: ['calm'],
  cost: { energy: 6, power: [{ kind: 'domain', domain: 'calm' }] },
  might: 6,
  keywords: ['shield'],
  text: "[Shield] (+1 [Might] while I'm a defender.)",
  flavor: '"A true master is an eternal student." —Master Yi',
})
