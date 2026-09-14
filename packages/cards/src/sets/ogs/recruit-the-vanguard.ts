import { defineCard } from '../../schema.js'

/**
 * OGS-015 — transcribed from the printed card.
 *
 * Tokens are created and Played (439, 419), and these may go to any Battlefield
 * their controller controls. Token creation has no step yet.
 */
export default defineCard({
  id: 'OGS-015',
  set: 'ogs',
  name: 'Recruit the Vanguard',
  type: 'spell',
  domains: ['order'],
  cost: { energy: 6, power: [] },
  keywords: ['action'],
  abilities: [
    {
      kind: 'spell',
      id: 'recruit-the-vanguard-effect',
      steps: [],
      notImplemented: 'token creation (439) has no step yet',
    },
  ],
  text: '[Action] (Play on your turn or in showdowns.) Play four 1 [Might] Recruit unit tokens. (They can be played to your base or to battlefields you control.)',
  flavor: '"My heart and sword always for Demacia." —Garen',
})
