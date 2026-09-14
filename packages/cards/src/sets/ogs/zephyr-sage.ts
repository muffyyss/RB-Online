import { defineCard } from '../../schema.js'

/**
 * OGS-005 — transcribed from the printed card.
 *
 * [Shield] (814) is not implemented, and an unimplemented keyword cannot be
 * listed in `keywords` — card-load rejects it rather than letting it do nothing.
 * It is recorded as a passive until the keyword lands, then moves to `keywords`.
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
  abilities: [
    {
      kind: 'passive',
      id: 'zephyr-sage-shield',
      text: '[Shield]',
      notImplemented: 'the Shield keyword (814) is not implemented yet',
    },
  ],
  text: "[Shield] (+1 [Might] while I'm a defender.)",
  flavor: '"A true master is an eternal student." —Master Yi',
})
