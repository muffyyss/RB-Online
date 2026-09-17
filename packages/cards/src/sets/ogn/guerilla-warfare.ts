import { defineCard } from '../../schema.js'

/**
 * OGN-264 - transcribed from the printed card. Teemo's Signature spell.
 *
 * Its [C] Power may be paid with either of its Domains (135.2.e.6.c).
 */
export default defineCard({
  id: 'OGN-264',
  set: 'ogn',
  name: 'Guerilla Warfare',
  type: 'spell',
  supertypes: ['signature'],
  tags: ['Teemo'],
  domains: ['chaos', 'mind'],
  cost: { energy: 2, power: [{ kind: 'self' }] },
  abilities: [
    {
      kind: 'spell',
      id: 'guerilla-warfare-effect',
      notImplemented: 'Hide and the Hidden keyword (811) are not implemented',
      steps: [
        {
          op: 'choose',
          as: '$cards',
          from: { kind: 'card', controller: 'self', zone: 'trash', count: 2 },
          optional: true,
        },
        { op: 'return-to-hand', target: '$cards' },
      ],
    },
  ],
  text: 'Return up to two cards with [Hidden] from your trash to your hand. You can hide ignoring costs this turn.',
})
