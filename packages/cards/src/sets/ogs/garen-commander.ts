import { defineCard } from '../../schema.js'

/**
 * OGS-013 — transcribed from the printed card.
 *
 * "Here" is his own location, base or battlefield (050).
 */
export default defineCard({
  id: 'OGS-013',
  set: 'ogs',
  name: 'Garen',
  subtitle: 'Commander',
  type: 'unit',
  supertypes: ['champion'],
  tags: ['Garen', 'Demacia', 'Elite'],
  domains: ['order'],
  cost: { energy: 6, power: [{ kind: 'domain', domain: 'order' }] },
  might: 5,
  abilities: [
    {
      kind: 'passive',
      id: 'garen-commander-aura',
      text: 'Other friendly units have +1 Might here.',
      effect: {
        kind: 'might',
        amount: 1,
        to: { kind: 'unit', controller: 'self', at: 'here', other: true },
      },
    },
  ],
  text: 'Other friendly units have +1 [Might] here.',
  flavor: '"For Demacia!"',
})
