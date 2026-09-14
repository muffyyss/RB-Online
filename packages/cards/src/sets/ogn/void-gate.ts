import { defineCard } from '../../schema.js'

/**
 * OGN-296 — transcribed from the printed card.
 */
export default defineCard({
  id: 'OGN-296',
  set: 'ogn',
  name: 'Void Gate',
  type: 'battlefield',
  domains: [],
  abilities: [
    {
      kind: 'passive',
      id: 'void-gate-bonus-damage',
      text: 'Spells and abilities affecting units here each deal 1 Bonus Damage.',
      notImplemented: 'Bonus Damage needs the continuous-effect layer',
    },
  ],
  text: 'Spells and abilities affecting units here each deal 1 Bonus Damage. (Each instance of damage the spell deals is increased by 1.)',
})
