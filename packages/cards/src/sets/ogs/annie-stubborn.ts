import { defineCard } from '../../schema.js'

/**
 * OGS-010 — transcribed from the printed card.
 */
export default defineCard({
  id: 'OGS-010',
  set: 'ogs',
  name: 'Annie',
  subtitle: 'Stubborn',
  type: 'unit',
  supertypes: ['champion'],
  tags: ['Annie', 'Noxus'],
  domains: ['chaos'],
  cost: { energy: 4, power: [{ kind: 'domain', domain: 'chaos' }] },
  might: 3,
  abilities: [
    {
      kind: 'triggered',
      id: 'annie-stubborn-return-spell',
      on: 'played',
      steps: [
        { op: 'choose', as: '$spell', from: { kind: 'spell', controller: 'self', zone: 'trash' } },
        { op: 'return-to-hand', target: '$spell' },
      ],
    },
  ],
  text: 'When you play me, return a spell from your trash to your hand.',
  flavor: 'I want a turn!',
})
