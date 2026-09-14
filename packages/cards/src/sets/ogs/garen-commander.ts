import { defineCard } from '../../schema.js'

/**
 * OGS-013 — transcribed from the printed card.
 *
 * "Here" is his own location (050). An aura on other units is a continuous
 * effect, which the engine cannot apply yet.
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
      notImplemented: 'auras on other units need the continuous-effect layer',
    },
  ],
  text: 'Other friendly units have +1 [Might] here.',
  flavor: '"For Demacia!"',
})
