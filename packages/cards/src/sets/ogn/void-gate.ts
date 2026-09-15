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
      // Whoever's spell or ability it is.
      effect: { kind: 'bonus-damage', amount: 1, to: { kind: 'unit', at: 'here' } },
    },
  ],
  text: 'Spells and abilities affecting units here each deal 1 Bonus Damage. (Each instance of damage the spell deals is increased by 1.)',
})
