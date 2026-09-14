import { defineCard } from '../../schema.js'

/**
 * OGS-001 — transcribed from the printed card.
 *
 * Bonus Damage raises each instance of damage her controller's spells and
 * abilities deal. That is a continuous effect on damage, and the engine has no
 * continuous-effect layer yet, so the ability is recorded but not run: Annie
 * plays as a 4-Might body until it lands.
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
      notImplemented: 'Bonus Damage needs the continuous-effect layer to modify damage dealt',
    },
  ],
  text: 'Your spells and abilities deal 1 Bonus Damage. (Each instance of damage they deal is increased by 1.)',
  flavor: 'I never play with matches.',
})
