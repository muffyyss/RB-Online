import { defineCard } from '../../schema.js'

/**
 * OGS-016 — transcribed from the printed card.
 *
 * Entering ready overrides units entering exhausted (143.4), which the engine
 * does not support yet.
 */
export default defineCard({
  id: 'OGS-016',
  set: 'ogs',
  name: 'Vanguard Attendant',
  type: 'unit',
  tags: ['Demacia', 'Elite'],
  domains: ['order'],
  cost: { energy: 6, power: [{ kind: 'domain', domain: 'order' }] },
  might: 5,
  abilities: [
    {
      kind: 'passive',
      id: 'vanguard-attendant-enter-ready',
      text: 'I enter ready.',
      notImplemented: 'entering ready is not implemented yet; units enter exhausted (143.4)',
    },
  ],
  text: 'I enter ready.',
  flavor: 'Even the Vanguard needs a first line of defense.',
})
