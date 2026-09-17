import { defineCard } from '../../schema.js'

/**
 * OGN-281 - transcribed from the printed card.
 */
export default defineCard({
  id: 'OGN-281',
  set: 'ogn',
  name: 'Hallowed Tomb',
  type: 'battlefield',
  domains: [],
  abilities: [
    {
      kind: 'triggered',
      id: 'hallowed-tomb-return-champion',
      on: 'hold',
      notImplemented: 'returning a card to the Champion Zone is not an effect step',
      steps: [{ op: 'draw', amount: 0 }],
    },
  ],
  text: 'When you hold here, you may return your Chosen Champion from your trash to your Champion Zone if it is empty.',
})
