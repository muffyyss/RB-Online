import { defineCard } from '../../schema.js'

/**
 * OGN-287 - transcribed from the printed card.
 */
export default defineCard({
  id: 'OGN-287',
  set: 'ogn',
  name: 'Sigil of the Storm',
  type: 'battlefield',
  domains: [],
  abilities: [
    {
      kind: 'triggered',
      id: 'sigil-of-the-storm-recycle',
      on: 'conquer',
      steps: [
        { op: 'choose', as: '$rune', from: { kind: 'rune', controller: 'self' } },
        { op: 'recycle', target: '$rune' },
      ],
    },
  ],
  text: 'When you conquer here, recycle one of your runes.',
})
