import { defineCard } from '../../schema.js'

/**
 * OGN-252 - transcribed from the printed card. Jinx's Signature spell.
 *
 * Its [C] Power may be paid with either of its Domains (135.2.e.6.c).
 */
export default defineCard({
  id: 'OGN-252',
  set: 'ogn',
  name: 'Super Mega Death Rocket!',
  type: 'spell',
  supertypes: ['signature'],
  tags: ['Jinx'],
  domains: ['chaos', 'fury'],
  cost: { energy: 4, power: [{ kind: 'self' }] },
  abilities: [
    {
      kind: 'spell',
      id: 'super-mega-death-rocket-effect',
      steps: [
        { op: 'choose', as: '$unit', from: { kind: 'unit' } },
        { op: 'deal', amount: 5, target: '$unit' },
      ],
    },
    {
      kind: 'triggered',
      id: 'super-mega-death-rocket-return',
      on: 'conquer',
      notImplemented: 'an ability that works from the trash is not modelled',
      steps: [{ op: 'draw', amount: 0 }],
    },
  ],
  text: 'Deal 5 to a unit. When you conquer, you may discard 1 to return this from your trash to your hand.',
})
