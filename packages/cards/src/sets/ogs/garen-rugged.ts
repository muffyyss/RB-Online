import { defineCard } from '../../schema.js'

/**
 * OGS-007 — transcribed from the printed card.
 *
 * [Assault 2] (807) and [Shield 2] (814): +2 Might while attacking or
 * defending. Neither keyword is implemented, so both are recorded as passives
 * until they land and can move to `keywords`.
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
  abilities: [
    {
      kind: 'passive',
      id: 'garen-rugged-assault',
      text: '[Assault 2]',
      notImplemented: 'the Assault keyword (807) is not implemented yet',
    },
    {
      kind: 'passive',
      id: 'garen-rugged-shield',
      text: '[Shield 2]',
      notImplemented: 'the Shield keyword (814) is not implemented yet',
    },
  ],
  text: "[Assault 2], [Shield 2] (+2 [Might] while I'm an attacker or defender.)",
  flavor: 'Fear is the first of many foes.',
})
