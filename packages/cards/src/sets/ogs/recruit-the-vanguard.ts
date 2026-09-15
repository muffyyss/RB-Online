import { defineCard } from '../../schema.js'

/**
 * OGS-015 — transcribed from the printed card.
 *
 * Tokens are created and Played (439, 419). Each of the four may go to its
 * player's Base or any Battlefield they control, so the choice is asked once
 * per token; with no Battlefield under control there is nothing to ask.
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
      steps: [
        {
          op: 'repeat',
          times: 4,
          steps: [
            {
              op: 'choose',
              as: '$where',
              from: { kind: 'battlefield', controller: 'self' },
              // Choosing none plays it to Base.
              optional: true,
            },
            { op: 'play-token', token: 'TOK-001', to: '$where' },
          ],
        },
      ],
    },
  ],
  text: '[Action] (Play on your turn or in showdowns.) Play four 1 [Might] Recruit unit tokens. (They can be played to your base or to battlefields you control.)',
  flavor: '"My heart and sword always for Demacia." —Garen',
})
