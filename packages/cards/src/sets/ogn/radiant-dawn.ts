import { defineCard } from '../../schema.js'

/**
 * OGN-261 - transcribed from the printed card. Radiant Dawn's Legend.
 *
 * A Legend sets the deck's Domain Identity (103.1.b) and is never played: it
 * starts in the Legend Zone and stays there (133.6.b.1, 107.4.d).
 */
export default defineCard({
  id: 'OGN-261',
  set: 'ogn',
  name: 'Radiant Dawn',
  type: 'legend',
  tags: ['Leona'],
  domains: ['calm', 'order'],
  abilities: [
    {
      kind: 'triggered',
      id: 'radiant-dawn-buff',
      on: 'played',
      notImplemented: 'a trigger on stunning enemy units is not modelled',
      steps: [
        { op: 'choose', as: '$ally', from: { kind: 'unit', controller: 'self' } },
        { op: 'buff', amount: 1, target: '$ally' },
      ],
    },
  ],
  text: "When you stun one or more enemy units, buff a friendly unit. (If it doesn't have a buff, it gets a +1 [Might] buff.)",
})
