import { defineCard } from '../../schema.js'

/**
 * OGS-012 — transcribed from the printed card.
 *
 * Kill, not damage: Might does not matter (428). A unit in a base is not a
 * legal target.
 */
export default defineCard({
  id: 'OGS-012',
  set: 'ogs',
  name: 'Blast of Power',
  type: 'spell',
  domains: ['order'],
  cost: { energy: 6, power: [{ kind: 'domain', domain: 'order' }] },
  keywords: ['action'],
  abilities: [
    {
      kind: 'spell',
      id: 'blast-of-power-effect',
      steps: [
        { op: 'choose', as: '$victim', from: { kind: 'unit', at: 'any-battlefield' } },
        { op: 'kill', target: '$victim' },
      ],
    },
  ],
  text: '[Action] (Play on your turn or in showdowns.) Kill a unit at a battlefield.',
  flavor: '"Illuminate the enemy!" —Lux',
})
