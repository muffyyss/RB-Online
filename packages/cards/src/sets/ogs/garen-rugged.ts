import { defineCard } from '../../schema.js'

/**
 * OGS-007 — transcribed from the printed card.
 *
 * [Assault 2] (807) and [Shield 2] (814): +2 Might while attacking or
 * defending.
 */
export default defineCard({
  id: 'OGS-007',
  set: 'ogs',
  name: 'Garen',
  subtitle: 'Rugged',
  type: 'unit',
  supertypes: ['champion'],
  tags: ['Garen', 'Demacia', 'Elite'],
  domains: ['body'],
  cost: { energy: 6, power: [{ kind: 'domain', domain: 'body' }] },
  might: 5,
  keywords: [
    ['assault', 2],
    ['shield', 2],
  ],
  text: "[Assault 2], [Shield 2] (+2 [Might] while I'm an attacker or defender.)",
  flavor: 'Fear is the first of many foes.',
})
