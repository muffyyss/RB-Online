import { defineCard } from '../../schema.js'

/**
 * OGN-275 - transcribed from the printed card.
 */
export default defineCard({
  id: 'OGN-275',
  set: 'ogn',
  name: 'Altar to Unity',
  type: 'battlefield',
  domains: [],
  abilities: [
    {
      kind: 'triggered',
      id: 'altar-to-unity-recruit',
      on: 'hold',
      steps: [{ op: 'play-token', token: 'TOK-001', to: 'base' }],
    },
  ],
  text: 'When you hold here, play a 1 [Might] Recruit unit token in your base.',
})
