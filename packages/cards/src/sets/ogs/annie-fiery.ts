import { defineCard } from '../../schema.js'

/**
 * OGS-001 — transcribed from the printed card.
 *
 * Bonus Damage raises each instance of damage her controller's spells and
 * abilities deal (712-715). Combat damage is not dealt by a spell or ability.
 */
export default defineCard({
  id: 'OGS-001',
  set: 'ogs',
  name: 'Annie',
  subtitle: 'Fiery',
  type: 'unit',
  supertypes: ['champion'],
  tags: ['Annie', 'Noxus'],
  domains: ['fury'],
  cost: { energy: 5, power: [{ kind: 'domain', domain: 'fury' }] },
  might: 4,
  abilities: [
    {
      kind: 'passive',
      id: 'annie-fiery-bonus-damage',
      text: 'Your spells and abilities deal 1 Bonus Damage.',
      effect: { kind: 'bonus-damage', amount: 1, dealtBy: 'self' },
    },
  ],
  text: 'Your spells and abilities deal 1 Bonus Damage. (Each instance of damage they deal is increased by 1.)',
  flavor: 'I never play with matches.',
})
