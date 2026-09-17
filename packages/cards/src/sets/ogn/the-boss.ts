import { defineCard } from '../../schema.js'

/**
 * OGN-269 - transcribed from the printed card. The Boss's Legend.
 *
 * A Legend sets the deck's Domain Identity (103.1.b) and is never played: it
 * starts in the Legend Zone and stays there (133.6.b.1, 107.4.d).
 */
export default defineCard({
  id: 'OGN-269',
  set: 'ogn',
  name: 'The Boss',
  type: 'legend',
  tags: ['Sett'],
  domains: ['body', 'order'],
  abilities: [
    {
      kind: 'triggered',
      id: 'the-boss-recall-buffed',
      on: 'killed',
      notImplemented: 'paying a cost and spending a Buff to replace a death is not modelled',
      steps: [{ op: 'recall-instead-of-dying', target: '$me', duration: 'this-turn' }],
    },
    {
      kind: 'triggered',
      id: 'the-boss-ready',
      on: 'conquer',
      steps: [{ op: 'ready', target: '$me' }],
    },
  ],
  text: "When a buffed unit you control would die, you may pay [A] and exhaust me to spend its buff and recall it exhausted instead. (Send it to base. This isn't a move.) When you conquer, ready me.",
})
