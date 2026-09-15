import { defineCard } from '../../schema.js'

/**
 * OGS-006 — transcribed from the printed card.
 *
 * The cost condition reads the spell's printed cost, not what was paid (206).
 */
export default defineCard({
  id: 'OGS-006',
  set: 'ogs',
  name: 'Lux',
  subtitle: 'Illuminated',
  type: 'unit',
  supertypes: ['champion'],
  tags: ['Lux', 'Demacia'],
  domains: ['mind'],
  cost: { energy: 6, power: [{ kind: 'domain', domain: 'mind' }] },
  might: 5,
  abilities: [
    {
      kind: 'triggered',
      id: 'lux-illuminated-empowered',
      on: 'spell-played',
      condition: { kind: 'spell-cost-at-least', energy: 5 },
      steps: [{ op: 'give-might', amount: 3, target: '$me', duration: 'this-turn' }],
    },
  ],
  text: 'When you play a spell that costs [5] or more, give me +3 [Might] this turn.',
  flavor: 'No more holding back!',
})
