import { defineCard } from '../../schema.js'

/**
 * OGN-291 - transcribed from the printed card.
 */
export default defineCard({
  id: 'OGN-291',
  set: 'ogn',
  name: 'The Candlelit Sanctum',
  type: 'battlefield',
  domains: [],
  abilities: [
    {
      kind: 'triggered',
      id: 'the-candlelit-sanctum-look',
      on: 'conquer',
      notImplemented: 'looking at two cards and ordering them back is not an effect step',
      steps: [{ op: 'predict' }],
    },
  ],
  text: "When you conquer here, look at the top two cards of your Main Deck. You may recycle one or both of them. Put those you don't back in any order.",
})
