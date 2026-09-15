import { defineCard } from '../../schema.js'

/**
 * OGS-016 — transcribed from the printed card.
 *
 * Entering ready replaces entering exhausted (143.4); it is not readying.
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
      effect: { kind: 'enters-ready' },
    },
  ],
  text: 'I enter ready.',
  flavor: 'Even the Vanguard needs a first line of defense.',
})
